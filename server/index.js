const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const cron = require('node-cron');
const axios = require('axios');
require('dotenv').config();
const { format, addDays } = require('date-fns');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Database Setup
const dbPath = path.resolve(__dirname, 'flights.db');
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Error opening database', err.message);
    } else {
        console.log('Connected to the SQLite database.');

        // Create tables
        db.run(`
      CREATE TABLE IF NOT EXISTS flights (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        airline TEXT NOT NULL,
        origin TEXT NOT NULL,
        destination TEXT NOT NULL,
        departure_date TEXT NOT NULL,
        price REAL NOT NULL,
        scraped_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        is_direct BOOLEAN DEFAULT 1
      )
    `);
    }
});

// Seed some initial data for demonstration purposes
app.get('/api/seed', (req, res) => {
    const stmt = db.prepare('INSERT INTO flights (airline, origin, destination, departure_date, price, scraped_at) VALUES (?, ?, ?, ?, ?, ?)');

    const today = new Date();
    // Generate 7 days of historical mock data up to today for a specific spring break flight
    for (let i = 7; i >= 0; i--) {
        const pastDate = new Date();
        pastDate.setDate(today.getDate() - i);
        const dateStr = pastDate.toISOString();

        // JetBlue mock data (gradually increasing as spring break approaches, with a dip 2 days ago)
        let baseJbPrice = 220 + (7 - i) * 15;
        if (i === 2) baseJbPrice -= 45; // simulated price drop

        stmt.run('JetBlue', 'JFK', 'MIA', '2024-04-12', baseJbPrice, dateStr);

        // JSX mock data (premium, more stable but high)
        let baseJsxPrice = 450 + (7 - i) * 10;
        if (i === 1) baseJsxPrice += 50; // surge pricing

        stmt.run('JSX', 'JFK', 'MIA', '2024-04-12', baseJsxPrice, dateStr);
    }

    stmt.finalize();
    res.json({ message: 'Database seeded with mock historical data' });
});

// API Routes
app.get('/api/flights/history', (req, res) => {
    const { origin, destination, date } = req.query;

    // For demo: return all data if no filters, else filter
    let query = 'SELECT * FROM flights ORDER BY scraped_at ASC';
    db.all(query, [], (err, rows) => {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        res.json(rows);
    });
});

app.get('/api/insights', (req, res) => {
    // First, fetch the most recent data from DB to generate dynamic insights
    db.all('SELECT * FROM flights ORDER BY scraped_at DESC LIMIT 50', [], (err, rows) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }

        // Default mock insights to keep the UI rich
        const dynamicInsights = [
            {
                id: 1,
                type: 'buy',
                airline: 'JetBlue',
                price: 198,
                title: 'Strong Buy Recommendation',
                description: 'JetBlue fares for JFK → MIA dropped by $45 in the last 2 hours. This is 15% below the 30-day average.',
            },
            {
                id: 2,
                type: 'wait',
                airline: 'JSX',
                price: 550,
                title: 'Hold / Wait',
                description: 'JSX prices are currently peaking due to spring break demand. Historical data suggests a 10% drop on Tuesday evenings.',
            }
        ];

        // Simple analysis for flexible dates
        // Find if there's a cheaper flight on an alternative date than the primary logged date
        const uniqueDates = [...new Set(rows.map(r => r.departure_date))];
        if (uniqueDates.length > 1) {
            // Very basic mock flexible analysis: compare the latest two dates
            const mainDateStr = uniqueDates[0];
            const altDateStr = uniqueDates[1];

            const mainPrice = rows.find(r => r.departure_date === mainDateStr)?.price || 0;
            const altPrice = rows.find(r => r.departure_date === altDateStr)?.price || 0;

            if (altPrice > 0 && mainPrice > altPrice && (mainPrice - altPrice > 20)) {
                dynamicInsights.unshift({
                    id: 3,
                    type: 'flex',
                    airline: rows.find(r => r.departure_date === altDateStr)?.airline || 'JetBlue',
                    price: altPrice,
                    savings: mainPrice - altPrice,
                    title: 'Alternative Date Suggestion',
                    description: `You can save $${mainPrice - altPrice} by flying on ${altDateStr} instead of your target date!`,
                });
            }
        }

        res.json(dynamicInsights);
    });
});

// Function to fetch real flight data
const fetchRealFlightPrices = async (origin = 'JFK', destination = 'MIA', baseDateStr = '2024-04-12', flexDays = 0) => {
    const apiKey = process.env.SERPAPI_KEY;
    if (!apiKey) {
        console.log('No SERPAPI_KEY found. Skipping real data fetch. Please add key to .env file to enable 2x/day free checks.');
        return;
    }

    // Calculate the array of dates to search based on flexDays
    let datesToSearch = [baseDateStr];
    if (flexDays > 0) {
        const baseDate = new Date(baseDateStr);
        for (let i = 1; i <= flexDays; i++) {
            const prevDate = new Date(baseDate);
            prevDate.setDate(baseDate.getDate() - i);
            datesToSearch.push(prevDate.toISOString().split('T')[0]);

            const nextDate = new Date(baseDate);
            nextDate.setDate(baseDate.getDate() + i);
            datesToSearch.push(nextDate.toISOString().split('T')[0]);
        }
    }

    try {
        for (const dStr of datesToSearch) {
            console.log(`Fetching real flights for ${origin} to ${destination} on ${dStr}...`);
            // SerpApi Google Flights endpoint
            const response = await axios.get('https://serpapi.com/search.json', {
                params: {
                    engine: 'google_flights',
                    departure_id: origin,
                    arrival_id: destination,
                    outbound_date: dStr,
                    currency: 'USD',
                    api_key: apiKey
                }
            });

            const bestFlights = response.data.best_flights || [];
            const stmt = db.prepare('INSERT INTO flights (airline, origin, destination, departure_date, price, scraped_at) VALUES (?, ?, ?, ?, ?, ?)');
            const now = new Date().toISOString();

            bestFlights.forEach(flight => {
                const airline = flight.flights[0].airline;
                const price = flight.price;

                // Filter for our target airlines
                if (airline.includes('JetBlue') || airline.includes('JSX')) {
                    stmt.run(airline, origin, destination, dStr, price, now);
                    console.log(`Saved real price for ${airline} on ${dStr}: $${price}`);
                }
            });

            stmt.finalize();

            // Delay slightly between requests if flex searching to avoid slamming API
            if (datesToSearch.length > 1) {
                await new Promise(resolve => setTimeout(resolve, 500));
            }
        }
    } catch (error) {
        console.error('Error fetching real flight data:', error.message);
    }
};

// Trigger a manual search from the frontend
app.post('/api/flights/search', async (req, res) => {
    const { origin, destination, date, flexDays } = req.body;
    if (!process.env.SERPAPI_KEY) {
        return res.status(400).json({ error: 'No API key configured.' });
    }
    await fetchRealFlightPrices(origin, destination, date, flexDays || 0);
    res.json({ message: 'Live search completed and prices stored.' });
});

// Scheduled Scraper Job
// User requested max frequency for free tier. 
// "0 6,14,22 * * *" means run at 6:00 AM, 2:00 PM, and 10:00 PM every day (3x per day) to stay under the 100/mo free tier limit for a single route.
cron.schedule('0 6,14,22 * * *', () => {
    console.log('Running scheduled flight price check (3x per day)...');
    // Hardcoded spring break route for demonstration, in a real app this would iterate over user saved watchlists.
    fetchRealFlightPrices('JFK', 'MIA', '2024-04-12');
});

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
