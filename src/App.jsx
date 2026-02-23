import React, { useState, useEffect } from 'react';
import { Plane, Calendar, MapPin, Search, TrendingDown, Clock, CalendarPlus, LayoutDashboard } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { format, parseISO } from 'date-fns';
import './index.css';

const API_URL = import.meta.env.VITE_API_URL || '';

function App() {
    const [activeAirline, setActiveAirline] = useState('both');
    const [flightData, setFlightData] = useState([]);
    const [insights, setInsights] = useState([]);
    const [loading, setLoading] = useState(true);
    const [isSearching, setIsSearching] = useState(false);

    const [origin, setOrigin] = useState('HPN');
    const [destination, setDestination] = useState('PBI');
    const [dateRange, setDateRange] = useState('2026-03-01');
    const [returnDate, setReturnDate] = useState('2026-03-08');
    const [flexDays, setFlexDays] = useState(3);

    const fetchData = async () => {
        try {
            setLoading(true);
            const outParams = `?origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}`;
            const retParams = `?origin=${encodeURIComponent(destination)}&destination=${encodeURIComponent(origin)}`;
            const [outFlightsRes, retFlightsRes, outInsightsRes, retInsightsRes] = await Promise.all([
                fetch(`${API_URL}/api/flights/history${outParams}`),
                fetch(`${API_URL}/api/flights/history${retParams}`),
                fetch(`${API_URL}/api/insights${outParams}`),
                fetch(`${API_URL}/api/insights${retParams}`)
            ]);
            const outFlights = await outFlightsRes.json();
            const retFlights = await retFlightsRes.json();
            const outInsights = await outInsightsRes.json();
            const retInsights = await retInsightsRes.json();

            // Tag insights with leg direction
            outInsights.forEach(i => { i.leg = 'outbound'; });
            retInsights.forEach(i => { i.leg = 'return'; i.id = i.id + 100; });

            // Build chart from outbound departure dates (price by date)
            const chartDataMap = {};
            outFlights.forEach(flight => {
                const date = flight.departure_date || format(parseISO(flight.scraped_at), 'MMM dd');
                if (!chartDataMap[date]) chartDataMap[date] = { date };
                const key = flight.airline === 'JetBlue' ? 'jetblue' : 'jsx';
                if (!chartDataMap[date][key] || flight.price < chartDataMap[date][key]) {
                    chartDataMap[date][key] = flight.price;
                }
            });

            setFlightData(Object.values(chartDataMap).sort((a, b) => a.date.localeCompare(b.date)));
            setInsights([...outInsights, ...retInsights]);
        } catch (error) {
            console.error("Error fetching data:", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchData(); }, []);

    const handleLiveSearch = async () => {
        setIsSearching(true);
        try {
            const response = await fetch(`${API_URL}/api/flights/search`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ origin, destination, date: dateRange, returnDate, flexDays })
            });
            if (!response.ok) {
                const errorData = await response.json();
                alert(`Search failed: ${errorData.error || 'Server error'}\n\nMake sure your SERPAPI_KEY is inside server/.env`);
            } else {
                await fetchData();
            }
        } catch (err) {
            console.error(err);
            alert('Failed to connect to the server for live search.');
        } finally {
            setIsSearching(false);
        }
    };

    const CustomTooltip = ({ active, payload, label }) => {
        if (active && payload && payload.length) {
            return (
                <div className="custom-tooltip">
                    <p style={{ color: '#8a96a8', marginBottom: '0.3rem', fontWeight: 500, fontSize: '0.8rem' }}>{label}</p>
                    {payload.map((entry, index) => (
                        <p key={`item-${index}`} style={{ color: entry.color, fontWeight: 700, margin: '0.1rem 0', fontSize: '0.95rem' }}>
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
            {/* ═══ NAVBAR ═══ */}
            <nav className="hero-nav">
                <div className="nav-inner">
                    <div className="nav-brand">
                        <img src="/icon.png" alt="" className="brand-icon" />
                        <span className="brand-wordmark">AirBlair</span>
                    </div>

                    <div className="nav-links">
                        <button className="nav-btn active"><LayoutDashboard size={15} /> Dashboard</button>
                    </div>
                </div>
            </nav>

            {/* ═══ HERO ═══ */}
            <section className="hero-section">
                <div className="cloud cloud-1"></div>
                <div className="cloud cloud-2"></div>
                <div className="cloud cloud-3"></div>
                <div className="cloud cloud-4"></div>
                <div className="hero-inner">
                    <div className="hero-text">
                        <h1 className="hero-title">
                            <span className="hero-title-accent">Airfare</span> Tracking
                        </h1>
                        <p className="hero-subtitle">Monitor JetBlue &amp; JSX fares in real-time</p>

                        <div className="airline-toggle">
                            <button className={`toggle-btn ${activeAirline === 'both' ? 'active' : ''}`} onClick={() => setActiveAirline('both')}>All Airlines</button>
                            <button className={`toggle-btn ${activeAirline === 'jetblue' ? 'active' : ''}`} onClick={() => setActiveAirline('jetblue')}>JetBlue</button>
                            <button className={`toggle-btn ${activeAirline === 'jsx' ? 'active' : ''}`} onClick={() => setActiveAirline('jsx')}>JSX</button>
                        </div>
                    </div>

                    <div className="hero-logo-float">
                        <img src="/icon.png" alt="" className="hero-logo-img" />
                    </div>
                </div>
            </section>

            {/* ═══ DASHBOARD ═══ */}
            <main className="main-content">
                {/* Search Bar */}
                <div className="search-card">
                    <div className="search-group">
                        <label>Origin</label>
                        <div className="input-with-icon">
                            <MapPin size={15} />
                            <input type="text" value={origin} onChange={(e) => setOrigin(e.target.value)} placeholder="Airport code" />
                        </div>
                    </div>

                    <div className="search-divider"><Plane size={16} /></div>

                    <div className="search-group">
                        <label>Destination</label>
                        <div className="input-with-icon">
                            <MapPin size={15} />
                            <input type="text" value={destination} onChange={(e) => setDestination(e.target.value)} placeholder="Airport code" />
                        </div>
                    </div>

                    <div className="search-group">
                        <label>Depart</label>
                        <div className="input-with-icon">
                            <Calendar size={15} />
                            <input type="date" value={dateRange} onChange={(e) => setDateRange(e.target.value)} />
                        </div>
                    </div>

                    <div className="search-group">
                        <label>Return</label>
                        <div className="input-with-icon">
                            <Calendar size={15} />
                            <input type="date" value={returnDate} onChange={(e) => setReturnDate(e.target.value)} />
                        </div>
                    </div>

                    <div className="search-group">
                        <label>Flex</label>
                        <div className="input-with-icon select-wrapper">
                            <CalendarPlus size={15} />
                            <select value={flexDays} onChange={(e) => setFlexDays(parseInt(e.target.value))} className="flex-select">
                                <option value={0}>Exact</option>
                                <option value={1}>&plusmn; 1 Day</option>
                                <option value={2}>&plusmn; 2 Days</option>
                                <option value={3}>&plusmn; 3 Days</option>
                            </select>
                        </div>
                    </div>

                    <button className="btn-track" onClick={handleLiveSearch} disabled={isSearching} style={{ opacity: isSearching ? 0.7 : 1 }}>
                        <Search size={15} />
                        <span>{isSearching ? 'Searching...' : 'Track Route'}</span>
                        <img src="/icon.png" alt="" className="track-icon" />
                    </button>
                </div>

                <section className="dashboard-grid">
                    <div className="chart-card">
                        <div className="card-header">
                            <div className="card-title-group">
                                <h3>Price Trends</h3>
                                <p>Interactive price trends in historical data</p>
                            </div>
                            <div className="chart-actions">
                                <button className="btn-small">1D</button>
                                <button className="btn-small active">1W</button>
                                <button className="btn-small">1M</button>
                            </div>
                        </div>

                        <div className="chart-container" style={{ height: '380px', width: '100%' }}>
                            {loading || isSearching ? (
                                <div className="chart-placeholder">
                                    <div className="chart-line-mock"></div>
                                    <p className="chart-text-mock">{isSearching ? 'Fetching live prices...' : 'Loading data...'}</p>
                                </div>
                            ) : (
                                <ResponsiveContainer width="100%" height="100%">
                                    <LineChart data={flightData} margin={{ top: 10, right: 16, left: -4, bottom: 0 }}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(10,26,51,0.05)" vertical={false} />
                                        <XAxis dataKey="date" stroke="#c5cdd8" tick={{ fill: '#8a96a8', fontSize: 11.5, fontFamily: 'DM Sans' }} tickMargin={12} axisLine={false} />
                                        <YAxis stroke="#c5cdd8" tick={{ fill: '#8a96a8', fontSize: 11.5, fontFamily: 'DM Sans' }} tickFormatter={(val) => `$${val}`} tickMargin={8} axisLine={false} tickLine={false} />
                                        <Tooltip content={<CustomTooltip />} />

                                        {(activeAirline === 'both' || activeAirline === 'jetblue') && (
                                            <Line type="monotone" dataKey="jetblue" stroke="#0e2445" strokeWidth={2.5}
                                                dot={{ r: 3.5, strokeWidth: 2, fill: '#fff', stroke: '#0e2445' }}
                                                activeDot={{ r: 6, stroke: '#0e2445', strokeWidth: 2, fill: '#fff' }} />
                                        )}

                                        {(activeAirline === 'both' || activeAirline === 'jsx') && (
                                            <Line type="monotone" dataKey="jsx" stroke="#c51f28" strokeWidth={2.5}
                                                dot={{ r: 3.5, strokeWidth: 2, fill: '#fff', stroke: '#c51f28' }}
                                                activeDot={{ r: 6, stroke: '#c51f28', strokeWidth: 2, fill: '#fff' }} />
                                        )}
                                    </LineChart>
                                </ResponsiveContainer>
                            )}
                        </div>
                    </div>

                    <div className="insights-sidebar">
                        {!loading && !isSearching && insights.length === 0 && (
                            <div className="insight-card" style={{ textAlign: 'center', padding: '2rem 1rem', color: '#8a96a8' }}>
                                <Plane size={32} style={{ marginBottom: '0.5rem', opacity: 0.4 }} />
                                <p style={{ fontSize: '0.85rem' }}>Search a route to see price insights</p>
                            </div>
                        )}
                        {!loading && !isSearching && insights.map((insight) => (
                            <div key={insight.id} className={`insight-card suggestion-${insight.type}`}>
                                <div className={`insight-icon bg-${insight.type === 'buy' ? 'green' : (insight.type === 'wait' ? 'yellow' : 'blue')}`}>
                                    {insight.type === 'buy' ? (
                                        <TrendingDown size={20} color="#10b981" />
                                    ) : insight.type === 'flex' ? (
                                        <CalendarPlus size={20} color="#1c4480" />
                                    ) : (
                                        <Clock size={20} color="#c9a034" />
                                    )}
                                </div>
                                <div className="insight-content">
                                    {insight.leg && <span style={{ fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: insight.leg === 'outbound' ? '#1c4480' : '#c51f28' }}>{insight.leg === 'outbound' ? `✈ ${origin}→${destination}` : `✈ ${destination}→${origin}`}</span>}
                                    <h4>{insight.title}</h4>
                                    <p>{insight.description}</p>
                                    <div className="current-price">
                                        <span className="price">${insight.price} {insight.type === 'flex' && <span style={{ fontSize: '0.75rem', color: '#10b981', fontWeight: 600 }}>(-${insight.savings})</span>}</span>
                                        <span className={`airline-badge ${insight.airline.toLowerCase()}`}>{insight.airline}</span>
                                    </div>
                                    {insight.searchUrl && (
                                        <a href={insight.searchUrl} target="_blank" rel="noopener noreferrer" className="insight-link">
                                            View on Google Flights →
                                        </a>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </section>
            </main>

            {/* ═══ FOOTER ═══ */}
            <footer className="app-footer">
                <div className="footer-inner">
                    <div className="footer-brand">
                        <img src="/icon.png" alt="" />
                        <span>AirBlair</span>
                    </div>
                    <span className="footer-text">JetBlue &amp; JSX Price Intelligence</span>
                </div>
            </footer>
        </div>
    );
}

export default App;
