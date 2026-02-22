import React, { useState, useEffect } from 'react';
import { Plane, Calendar, ArrowRight, TrendingDown, Clock, Search, Briefcase, Bell, AlertTriangle, CalendarPlus } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { format, parseISO } from 'date-fns';
import './index.css';

function App() {
    const [activeAirline, setActiveAirline] = useState('both');
    const [flightData, setFlightData] = useState([]);
    const [insights, setInsights] = useState([]);
    const [loading, setLoading] = useState(true);
    const [isSearching, setIsSearching] = useState(false);

    // Form states
    const [origin, setOrigin] = useState('JFK');
    const [destination, setDestination] = useState('MIA');
    const [dateRange, setDateRange] = useState('2024-04-12'); // Simplified for demo
    const [flexDays, setFlexDays] = useState(0); // 0 (exact), 1, 2, or 3 days flexibility

    const fetchData = async () => {
        try {
            setLoading(true);
            const [flightsRes, insightsRes] = await Promise.all([
                fetch('http://localhost:3001/api/flights/history'),
                fetch('http://localhost:3001/api/insights')
            ]);

            const rawFlights = await flightsRes.json();
            const insightsData = await insightsRes.json();

            // Transform sqlite data for Recharts
            // We group by date to show multiple lines on the same axis
            const chartDataMap = {};

            rawFlights.forEach(flight => {
                const date = format(parseISO(flight.scraped_at), 'MMM dd');
                if (!chartDataMap[date]) {
                    chartDataMap[date] = { date };
                }
                if (flight.airline === 'JetBlue') {
                    chartDataMap[date].jetblue = flight.price;
                } else if (flight.airline === 'JSX') {
                    chartDataMap[date].jsx = flight.price;
                }
            });

            // Ensure chronological order
            const formattedChartData = Object.values(chartDataMap).sort((a, b) => {
                return new Date(a.date) - new Date(b.date);
            });

            setFlightData(formattedChartData);
            setInsights(insightsData);
        } catch (error) {
            console.error("Error fetching data:", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    const handleLiveSearch = async () => {
        setIsSearching(true);
        try {
            const response = await fetch('http://localhost:3001/api/flights/search', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ origin, destination, date: dateRange, flexDays })
            });

            if (!response.ok) {
                const errorData = await response.json();
                alert(`Search failed: ${errorData.error || 'Server error'}\n\nMake sure your SERPAPI_KEY is inside server/.env`);
            } else {
                // Refresh chart with new live data
                await fetchData();
            }
        } catch (err) {
            console.error(err);
            alert('Failed to connect to the server for live search.');
        } finally {
            setIsSearching(false);
        }
    };

    // Custom Recharts Tooltip styled for our glass theme
    const CustomTooltip = ({ active, payload, label }) => {
        if (active && payload && payload.length) {
            return (
                <div className="custom-tooltip card-glass" style={{ padding: '1rem', border: '1px solid var(--border-subtle)', background: 'var(--surface-primary)' }}>
                    <p style={{ color: 'var(--text-secondary)', marginBottom: '0.5rem', fontWeight: 500 }}>{label}</p>
                    {payload.map((entry, index) => (
                        <p key={`item-${index}`} style={{ color: entry.color, fontWeight: 600, margin: '0.25rem 0' }}>
                            {entry.name === 'jetblue' ? 'JetBlue' : 'JSX'}: ${entry.value}
                        </p>
                    ))}
                </div>
            );
        }
        return null;
    };

    return (
        <div className="app-container">
            <nav className="navbar">
                <div className="nav-brand">
                    <Plane className="brand-icon" />
                    <span className="brand-text">AirBlair</span>
                </div>
                <div className="nav-links">
                    <button className="nav-btn active">Dashboard</button>
                    <button className="nav-btn">Watchlists</button>
                    <button className="nav-btn">History</button>
                </div>
                <div className="nav-actions">
                    <button className="btn-icon"><Bell size={20} /></button>
                    <div className="user-avatar"></div>
                </div>
            </nav>

            <main className="main-content">
                <header className="page-header">
                    <div>
                        <h1 className="page-title">AirBlair Price Tracker</h1>
                        <p className="page-subtitle">Monitor JetBlue and JSX fares in near real-time.</p>
                    </div>
                    <div className="airline-toggle">
                        <button
                            className={`toggle-btn ${activeAirline === 'both' ? 'active' : ''}`}
                            onClick={() => setActiveAirline('both')}
                        >
                            All Airlines
                        </button>
                        <button
                            className={`toggle-btn ${activeAirline === 'jetblue' ? 'active' : ''}`}
                            onClick={() => setActiveAirline('jetblue')}
                        >
                            JetBlue
                        </button>
                        <button
                            className={`toggle-btn ${activeAirline === 'jsx' ? 'active' : ''}`}
                            onClick={() => setActiveAirline('jsx')}
                        >
                            JSX
                        </button>
                    </div>
                </header>

                <section className="search-section">
                    <div className="search-card flex-wrap">
                        <div className="search-group">
                            <label>Origin</label>
                            <div className="input-with-icon">
                                <Briefcase size={18} />
                                <input
                                    type="text"
                                    value={origin}
                                    onChange={(e) => setOrigin(e.target.value)}
                                    placeholder="e.g., JFK"
                                />
                            </div>
                        </div>

                        <div className="search-divider">
                            <ArrowRight size={20} className="text-secondary" />
                        </div>

                        <div className="search-group">
                            <label>Destination</label>
                            <div className="input-with-icon">
                                <Briefcase size={18} />
                                <input
                                    type="text"
                                    value={destination}
                                    onChange={(e) => setDestination(e.target.value)}
                                    placeholder="e.g., MIA"
                                />
                            </div>
                        </div>

                        <div className="search-group date-flex-group">
                            <label>Date (Outbound)</label>
                            <div className="input-with-icon">
                                <Calendar size={18} />
                                <input
                                    type="text"
                                    value={dateRange}
                                    onChange={(e) => setDateRange(e.target.value)}
                                    placeholder="YYYY-MM-DD"
                                    style={{ width: '120px' }}
                                />
                            </div>
                        </div>

                        <div className="search-group flexibility-group">
                            <label>Flexibility</label>
                            <div className="input-with-icon select-wrapper">
                                <CalendarPlus size={18} />
                                <select
                                    value={flexDays}
                                    onChange={(e) => setFlexDays(parseInt(e.target.value))}
                                    className="flex-select"
                                >
                                    <option value={0}>Exact Date</option>
                                    <option value={1}>± 1 Day</option>
                                    <option value={2}>± 2 Days</option>
                                    <option value={3}>± 3 Days</option>
                                </select>
                            </div>
                        </div>

                        <button
                            className="btn-primary search-btn"
                            onClick={handleLiveSearch}
                            disabled={isSearching}
                            style={{ opacity: isSearching ? 0.7 : 1 }}
                        >
                            <Search size={18} />
                            <span>{isSearching ? 'Fetching Live...' : 'Track Route'}</span>
                        </button>
                    </div>
                </section>

                <section className="dashboard-grid">
                    {/* Main Price Chart Area */}
                    <div className="chart-card card-glass">
                        <div className="card-header">
                            <h3>Price Trends</h3>
                            <div className="chart-actions">
                                <button className="btn-small">1D</button>
                                <button className="btn-small active">1W</button>
                                <button className="btn-small">1M</button>
                            </div>
                        </div>

                        <div className="chart-container" style={{ height: '400px', width: '100%' }}>
                            {loading || isSearching ? (
                                <div className="chart-placeholder">
                                    <div className="chart-line-mock"></div>
                                    <p className="chart-text-mock">{isSearching ? 'Fetching Real API (Multiple Dates)...' : 'Loading Data...'}</p>
                                </div>
                            ) : (
                                <ResponsiveContainer width="100%" height="100%">
                                    <LineChart data={flightData} margin={{ top: 20, right: 30, left: 0, bottom: 0 }}>
                                        <defs>
                                            <linearGradient id="colorJetBlue" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.8} />
                                                <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                                            </linearGradient>
                                            <linearGradient id="colorJSX" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor="#ef4444" stopOpacity={0.8} />
                                                <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                                            </linearGradient>
                                        </defs>
                                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                                        <XAxis dataKey="date" stroke="#94a3b8" tick={{ fill: '#94a3b8' }} tickMargin={15} axisLine={false} />
                                        <YAxis stroke="#94a3b8" tick={{ fill: '#94a3b8' }} tickFormatter={(val) => `$${val}`} tickMargin={10} axisLine={false} tickLine={false} />
                                        <Tooltip content={<CustomTooltip />} />

                                        {(activeAirline === 'both' || activeAirline === 'jetblue') && (
                                            <Line
                                                type="monotone"
                                                dataKey="jetblue"
                                                stroke="#3b82f6"
                                                strokeWidth={3}
                                                dot={{ r: 4, strokeWidth: 2, fill: '#090a0f' }}
                                                activeDot={{ r: 8, stroke: '#3b82f6', strokeWidth: 2, fill: '#090a0f' }}
                                            />
                                        )}

                                        {(activeAirline === 'both' || activeAirline === 'jsx') && (
                                            <Line
                                                type="monotone"
                                                dataKey="jsx"
                                                stroke="#ef4444"
                                                strokeWidth={3}
                                                dot={{ r: 4, strokeWidth: 2, fill: '#090a0f' }}
                                                activeDot={{ r: 8, stroke: '#ef4444', strokeWidth: 2, fill: '#090a0f' }}
                                            />
                                        )}
                                    </LineChart>
                                </ResponsiveContainer>
                            )}
                        </div>
                    </div>

                    {/* AI Suggestions & Insights */}
                    <div className="insights-sidebar">
                        {!loading && !isSearching && insights.map((insight) => (
                            <div key={insight.id} className={`insight-card suggestion-${insight.type}`}>
                                <div className={`insight-icon bg-${insight.type === 'buy' ? 'green' : (insight.type === 'wait' ? 'yellow' : 'blue')}`}>
                                    {insight.type === 'buy' ? (
                                        <TrendingDown size={24} color="#10b981" />
                                    ) : insight.type === 'flex' ? (
                                        <CalendarPlus size={24} color="#3b82f6" />
                                    ) : (
                                        <Clock size={24} color="#f59e0b" />
                                    )}
                                </div>
                                <div className="insight-content">
                                    <h4 style={{ color: insight.type === 'flex' ? '#3b82f6' : undefined }}>{insight.title}</h4>
                                    <p>{insight.description}</p>
                                    <div className="current-price">
                                        <span className="price">${insight.price} {insight.type === 'flex' && <span style={{ fontSize: '0.8rem', color: '#10b981', fontWeight: 500 }}>(-${insight.savings})</span>}</span>
                                        <span className={`airline-badge ${insight.airline.toLowerCase()}`}>
                                            {insight.airline}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </section>
            </main>
        </div>
    );
}

export default App;
