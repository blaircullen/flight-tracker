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
        is_direct BOOLEAN DEFAULT 1,
        departure_time TEXT,
        arrival_time TEXT,
        duration_min INTEGER,
        flight_number TEXT,
        stops INTEGER DEFAULT 0,
        booking_token TEXT
      )
    `);
        // Add columns if table already exists (migration)
        const cols = ['departure_time', 'arrival_time', 'duration_min', 'flight_number', 'stops', 'booking_token'];
        cols.forEach(col => {
            db.run(`ALTER TABLE flights ADD COLUMN ${col} ${col === 'duration_min' || col === 'stops' ? 'INTEGER' : 'TEXT'}`, () => {});
        });
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
    const { origin, destination } = req.query;

    let query, params;
    if (origin && destination) {
        query = 'SELECT * FROM flights WHERE UPPER(origin) = UPPER(?) AND UPPER(destination) = UPPER(?) ORDER BY scraped_at ASC';
        params = [origin, destination];
    } else {
        query = 'SELECT * FROM flights ORDER BY scraped_at ASC';
        params = [];
    }
    db.all(query, params, (err, rows) => {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        res.json(rows);
    });
});

app.get('/api/insights', (req, res) => {
    const { origin, destination } = req.query;
    let query, params;
    if (origin && destination) {
        query = 'SELECT * FROM flights WHERE UPPER(origin) = UPPER(?) AND UPPER(destination) = UPPER(?) ORDER BY scraped_at DESC LIMIT 100';
        params = [origin, destination];
    } else {
        query = 'SELECT * FROM flights ORDER BY scraped_at DESC LIMIT 100';
        params = [];
    }
    db.all(query, params, (err, rows) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }

        if (rows.length === 0) {
            return res.json([]);
        }

        const insights = [];
        let idCounter = 1;

        // Group by airline, find cheapest for each
        const byAirline = {};
        rows.forEach(r => {
            if (!byAirline[r.airline]) byAirline[r.airline] = [];
            byAirline[r.airline].push(r);
        });

        // Build a Google Flights search URL
        const buildGFUrl = (origin, dest, date) => {
            return `https://www.google.com/travel/flights?q=flights+from+${origin}+to+${dest}+on+${date}+one+way`;
        };

        const airlines = Object.keys(byAirline);
        airlines.forEach(airline => {
            const flights = byAirline[airline];
            const prices = flights.map(f => f.price);
            const minPrice = Math.min(...prices);
            const avgPrice = Math.round(prices.reduce((a, b) => a + b, 0) / prices.length);
            const cheapest = flights.find(f => f.price === minPrice);
            const route = `${cheapest.origin} → ${cheapest.destination}`;

            const flightDetail = cheapest.departure_time && cheapest.arrival_time
                ? `${cheapest.departure_time}–${cheapest.arrival_time}${cheapest.stops > 0 ? ` (${cheapest.stops} stop)` : ' nonstop'}`
                : '';
            const searchUrl = buildGFUrl(cheapest.origin, cheapest.destination, cheapest.departure_date);

            const base = {
                id: idCounter++,
                airline,
                price: minPrice,
                flightDetail,
                date: cheapest.departure_date,
                searchUrl,
            };

            if (minPrice < avgPrice * 0.9) {
                insights.push({ ...base, type: 'buy', title: 'Strong Buy Recommendation',
                    description: `${airline} ${route} at $${minPrice} — ${Math.round((1 - minPrice / avgPrice) * 100)}% below avg $${avgPrice}. ${flightDetail}`,
                });
            } else if (minPrice > avgPrice * 1.1) {
                insights.push({ ...base, type: 'wait', title: 'Hold / Wait',
                    description: `${airline} ${route} elevated at $${minPrice} (avg $${avgPrice}). Consider waiting.`,
                });
            } else {
                insights.push({ ...base, type: 'buy', title: 'Best Price Found',
                    description: `${airline} ${route} at $${minPrice}. ${flightDetail}`,
                });
            }
        });

        // Check for flexible date savings — per airline, cheapest flight across dates
        airlines.forEach(airline => {
            const flights = byAirline[airline];
            const uniqueDates = [...new Set(flights.map(f => f.departure_date))].filter(Boolean);
            if (uniqueDates.length <= 1) return;

            // Find cheapest single flight per date for this airline
            const cheapestByDate = {};
            flights.forEach(f => {
                if (!cheapestByDate[f.departure_date] || f.price < cheapestByDate[f.departure_date].price) {
                    cheapestByDate[f.departure_date] = f;
                }
            });

            const dates = Object.entries(cheapestByDate);
            dates.sort((a, b) => a[1].price - b[1].price);
            const cheapest = dates[0];
            const mostExpensive = dates[dates.length - 1];

            if (cheapest && mostExpensive && cheapest[0] !== mostExpensive[0]) {
                const savings = mostExpensive[1].price - cheapest[1].price;
                if (savings > 20) {
                    insights.push({
                        id: idCounter++,
                        type: 'flex',
                        airline,
                        price: cheapest[1].price,
                        savings,
                        title: `Cheaper ${airline} Date`,
                        description: `${airline} is $${cheapest[1].price} on ${cheapest[0]} vs $${mostExpensive[1].price} on ${mostExpensive[0]} — save $${savings}.`,
                    });
                }
            }
        });

        res.json(insights);
    });
});

// Function to fetch real flight data
// Round-robin key rotation across multiple SerpAPI keys
const serpApiKeys = [
    process.env.SERPAPI_KEY,
    process.env.SERPAPI_KEY_2,
].filter(Boolean);
let serpKeyIndex = 0;

const getNextSerpKey = () => {
    if (serpApiKeys.length === 0) return null;
    const key = serpApiKeys[serpKeyIndex % serpApiKeys.length];
    serpKeyIndex++;
    return key;
};

const fetchRealFlightPrices = async (origin = 'JFK', destination = 'MIA', baseDateStr = '2024-04-12', flexDays = 0) => {
    const apiKey = getNextSerpKey();
    if (!apiKey) {
        console.log('No SERPAPI_KEY found. Skipping real data fetch. Please add key to .env file to enable 2x/day free checks.');
        return;
    }

    // Normalize airport codes to uppercase
    origin = origin.toUpperCase();
    destination = destination.toUpperCase();

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
                    type: 2,  // One-way flight
                    currency: 'USD',
                    api_key: apiKey
                }
            });

            const allFlights = [...(response.data.best_flights || []), ...(response.data.other_flights || [])];
            const stmt = db.prepare('INSERT INTO flights (airline, origin, destination, departure_date, price, scraped_at, departure_time, arrival_time, duration_min, flight_number, stops, booking_token) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
            const now = new Date().toISOString();
            const bookingToken = response.data.search_metadata?.google_flights_url || '';

            allFlights.forEach(flight => {
                const leg = flight.flights?.[0] || {};
                const airline = leg.airline || '';
                const price = flight.price;

                // Only save JetBlue and JSX flights
                if (price && (airline.includes('JetBlue') || airline.includes('JSX'))) {
                    const depTime = leg.departure_airport?.time || '';
                    const arrTime = leg.arrival_airport?.time || '';
                    const duration = flight.total_duration || leg.duration || null;
                    const flightNum = leg.flight_number ? `${leg.airline_logo ? '' : ''}${airline} ${leg.flight_number}` : '';
                    const stops = (flight.flights?.length || 1) - 1;

                    stmt.run(airline, origin, destination, dStr, price, now, depTime, arrTime, duration, flightNum, stops, bookingToken);
                    console.log(`Saved: ${airline} ${flightNum} on ${dStr}: $${price} (${depTime}-${arrTime})`);
                }
            });

            stmt.finalize();

            // Delay slightly between requests if flex searching to avoid slamming API
            if (datesToSearch.length > 1) {
                await new Promise(resolve => setTimeout(resolve, 500));
            }
        }
    } catch (error) {
        console.error('Error fetching real flight data:', error.message, error.response?.data || '');
    }
};

// Trigger a manual search from the frontend
app.post('/api/flights/search', async (req, res) => {
    const { origin, destination, date, returnDate, flexDays } = req.body;
    if (serpApiKeys.length === 0) {
        return res.status(400).json({ error: 'No API key configured.' });
    }
    // Search outbound
    await fetchRealFlightPrices(origin, destination, date, flexDays || 0);
    // Search return leg if provided
    if (returnDate) {
        await fetchRealFlightPrices(destination, origin, returnDate, flexDays || 0);
    }
    res.json({ message: 'Live search completed and prices stored.' });
});

// Scheduled Scraper Job
// 2 SerpAPI keys × 250 free searches/month = 500 total. Keys rotate via round-robin.
// "0 6,14,22 * * *" = 3x/day (6 AM, 2 PM, 10 PM) — ~90 searches/month for a single route.
cron.schedule('0 6,14,22 * * *', () => {
    console.log('Running scheduled flight price check (3x per day)...');
    // Hardcoded spring break route for demonstration, in a real app this would iterate over user saved watchlists.
    fetchRealFlightPrices('JFK', 'MIA', '2024-04-12');
});

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
