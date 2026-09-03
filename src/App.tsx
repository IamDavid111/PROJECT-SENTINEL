const navItems = ['Platform', 'Industries', 'Outcomes', 'Product']

const featureCards = [
  { icon: '♧', title: 'Digital incident reporting', text: 'Capture near misses to fatalities in the field with GPS, photo, video and voice evidence — online or offline.' },
  { icon: '✓', title: 'Inspections & audits', text: 'Digital inspection types, custom templates, pass/fail checklists and audit programmes with a live calendar.' },
  { icon: '▱', title: 'Corrective action control', text: 'Every finding becomes a tracked action with owners, due dates, evidence and verification sign-off.' },
  { icon: '◎', title: 'Predictive risk intelligence', text: 'Risk scores per facility using historical incidents, observations and operating context.' },
  { icon: '✦', title: 'AI safety copilot', text: 'Ask plain-language questions about your safety data and get summaries, charts and recommendations.' },
  { icon: '⌑', title: 'Enterprise governance', text: 'Multi-tenant organisations, granular roles, full activity logging and exportable audit trails.' },
]

const benefitItems = [
  { icon: '♧', title: 'Frontline adoption', text: 'Glove-friendly mobile reporting with offline sync means events get captured when they happen.' },
  { icon: '⌁', title: 'Executive visibility', text: 'A single safety score, trend and forecast per site, department and contractor.' },
  { icon: '▥', title: 'Assurance on demand', text: 'Generate inspection, audit and corrective action reports as PDF or Excel in seconds.' },
]

function BrandMark() {
  return (
    <span className="brand-mark" aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none">
        <path d="M12 3.5 19 6v5.7c0 4.2-2.7 7.9-7 9.3-4.3-1.4-7-5.1-7-9.3V6l7-2.5Z" stroke="currentColor" strokeWidth="1.8" />
        <path d="m9.2 12 1.8 1.8 3.9-4.2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  )
}

function ThemeIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none">
      <path d="M20.2 15.2A8.5 8.5 0 0 1 8.8 3.8 8.5 8.5 0 1 0 20.2 15.2Z" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  )
}

export default function App() {
  return (
    <div className="app-shell">
      <header className="site-header">
        <div className="container nav-wrap">
          <a className="brand" href="#top" aria-label="SentinelQHSE home">
            <BrandMark />
            <span className="brand-copy">
              <strong>
                SentinelQHSE<sup>™</sup>
              </strong>
              <small>SAFETY INTELLIGENCE</small>
            </span>
          </a>

          <nav className="desktop-nav" aria-label="Primary navigation">
            {navItems.map((item) => (
              <a key={item} href={`#${item.toLowerCase()}`}>
                {item}
              </a>
            ))}
          </nav>

          <div className="nav-actions">
            <button className="theme-button" type="button" aria-label="Theme">
              <ThemeIcon />
            </button>
            <a className="signin-link" href="signin.html">
              Sign In
            </a>
            <a className="button button-green button-small" href="#contact">
              Request Demo
            </a>
          </div>

          <details className="mobile-menu">
            <summary aria-label="Open navigation">☰</summary>
            <div className="mobile-menu-panel">
              {navItems.map((item) => (
                <a key={item} href={`#${item.toLowerCase()}`}>
                  {item}
                </a>
              ))}
              <a href="signin.html">Sign In</a>
              <a className="button button-green" href="#contact">
                Request Demo
              </a>
            </div>
          </details>
        </div>
      </header>

      <main id="top">
        <section className="hero">
          <div className="hero-overlay" />
          <div className="container hero-grid">
            <div className="hero-copy">
              <div className="eyebrow hero-eyebrow">AI-Powered Operational Safety Intelligence Platform</div>
              <h1>From reactive incident reports to predictive safety intelligence.</h1>
              <p className="hero-text">
                SentinelQHSE™ helps energy companies capture every event in the field, close every corrective action,
                and forecast where the next incident is most likely to happen.
              </p>

              <div className="hero-actions">
                <a className="button button-green button-large" href="#contact">
                  Request Demo
                  <span aria-hidden="true">→</span>
                </a>
                <a className="button button-outline button-large" href="signin.html">
                  Sign In
                </a>
                <a className="text-link" href="#contact">
                  Contact Sales
                </a>
              </div>

              <div className="hero-metrics" aria-label="Platform outcomes">
                <div>
                  <strong>48%</strong>
                  <span>reduction in recordable incidents within four quarters</span>
                </div>
                <div>
                  <strong>3.1x</strong>
                  <span>increase in near-miss reporting from frontline crews</span>
                </div>
                <div>
                  <strong>62%</strong>
                  <span>faster corrective action closure across contractors</span>
                </div>
                <div>
                  <strong>100%</strong>
                  <span>auditable trail for regulator and client assurance</span>
                </div>
              </div>
            </div>

            <div className="dashboard-frame" aria-label="SentinelQHSE dashboard preview">
              <div className="dashboard-window">
                <div className="dash-sidebar">
                  <div className="dash-brand">
                    <span className="mini-mark">✓</span>
                    <span>
                      Sentinel<span>QHSE</span>
                    </span>
                  </div>
                  <div className="dash-nav active">Overview</div>
                  <div className="dash-nav">Incidents</div>
                  <div className="dash-nav">Observations</div>
                  <div className="dash-nav">Risk Management</div>
                  <div className="dash-nav">Audits &amp; Inspections</div>
                  <div className="dash-nav">Training</div>
                  <div className="dash-nav">Contractors</div>
                  <div className="dash-nav">Reports</div>
                  <div className="dash-nav">Analytics</div>
                  <div className="dash-nav">Alerts</div>
                </div>

                <div className="dash-main">
                  <div className="dash-top">
                    <strong>Overview</strong>
                    <span>All Locations</span>
                    <span>May 12 – Jun 8, 2026</span>
                    <span className="dash-filter">Filters</span>
                  </div>

                  <div className="stat-row">
                    <div className="stat-card">
                      <small>Total Recordable Incidents</small>
                      <b>0.73</b>
                      <em>↓ 18% vs prior period</em>
                    </div>
                    <div className="stat-card">
                      <small>Lost Time Incident Rate</small>
                      <b>0.23</b>
                      <em>↓ 23% vs prior period</em>
                    </div>
                    <div className="stat-card">
                      <small>Near Misses</small>
                      <b>152</b>
                      <em>↑ 12% vs prior period</em>
                    </div>
                    <div className="stat-card">
                      <small>Safety Observations</small>
                      <b>621</b>
                      <em>↑ 8% vs prior period</em>
                    </div>
                    <div className="stat-card warning-stat">
                      <small>High Risks</small>
                      <b>28</b>
                      <em>Needs attention</em>
                    </div>
                  </div>

                  <div className="dash-grid">
                    <div className="dash-card trend-card">
                      <div className="card-heading">
                        <strong>Safety trend</strong>
                        <span>Q2</span>
                      </div>
                      <div className="fake-chart">
                        <span className="chart-line line-one" />
                        <span className="chart-line line-two" />
                        <span className="chart-label l1">J</span>
                        <span className="chart-label l2">F</span>
                        <span className="chart-label l3">M</span>
                        <span className="chart-label l4">A</span>
                      </div>
                    </div>

                    <div className="dash-card donut-card">
                      <div className="card-heading">
                        <strong>Risk mix</strong>
                        <span>Live</span>
                      </div>
                      <div className="donut-wrap">
                        <div className="donut">
                          <span>34%</span>
                        </div>
                        <div className="legend">
                          <div>
                            <i style={{ background: '#20c96b' }} /> Operating
                          </div>
                          <div>
                            <i style={{ background: '#f4a51a' }} /> Process
                          </div>
                          <div>
                            <i style={{ background: '#8261d7' }} /> Culture
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="dash-card heat-card">
                      <div className="card-heading">
                        <strong>Hotspots</strong>
                        <span>Sites</span>
                      </div>
                      <div className="heat-map">
                        <span>1</span>
                        <span>2</span>
                        <span>3</span>
                        <span>4</span>
                        <span>5</span>
                        <span>6</span>
                        <span>7</span>
                        <span>8</span>
                        <span>9</span>
                        <span>10</span>
                        <span>11</span>
                        <span>12</span>
                        <span>13</span>
                        <span>14</span>
                        <span>15</span>
                      </div>
                    </div>

                    <div className="dash-card bars-card">
                      <div className="card-heading">
                        <strong>Closure rate</strong>
                        <span>30d</span>
                      </div>
                      <div className="bars">
                        <i style={{ height: '45%' }} />
                        <i style={{ height: '58%' }} />
                        <i style={{ height: '62%' }} />
                        <i style={{ height: '74%' }} />
                        <i style={{ height: '82%' }} />
                      </div>
                    </div>
                  </div>

                  <div className="dash-alerts">
                    <strong>Safety alerts</strong>
                    <span>3 high-priority actions due this week</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="platform" className="section section-light">
          <div className="container">
            <div className="section-intro">
              <div className="eyebrow">PLATFORM</div>
              <h2>One operating system for QHSE performance</h2>
              <p>
                Built to the workflows international oil and gas operators already run — and to the standards their
                regulators and clients audit against.
              </p>
            </div>

            <div className="feature-grid">
              {featureCards.map((card) => (
                <article key={card.title} className="feature-card">
                  <div className="icon-tile">{card.icon}</div>
                  <h3>{card.title}</h3>
                  <p>{card.text}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="industries" className="section industries">
          <div className="container">
            <div className="section-intro compact">
              <h2>Industries served</h2>
            </div>
            <div className="industry-grid">
              <div className="industry-card">
                <span>◫</span>
                <strong>Upstream E&amp;P</strong>
              </div>
              <div className="industry-card">
                <span>⚓</span>
                <strong>Offshore &amp; Marine</strong>
              </div>
              <div className="industry-card">
                <span>▥</span>
                <strong>
                  Refining &amp;
                  <br />
                  Petrochemical
                </strong>
              </div>
              <div className="industry-card">
                <span>≋</span>
                <strong>Pipelines &amp; Terminals</strong>
              </div>
              <div className="industry-card">
                <span>♙</span>
                <strong>Drilling Contractors</strong>
              </div>
              <div className="industry-card">
                <span>◉</span>
                <strong>Energy Services</strong>
              </div>
            </div>
          </div>
        </section>

        <section id="outcomes" className="section outcomes">
          <div className="container outcome-grid">
            <div className="outcome-copy">
              <div className="eyebrow">CUSTOMER BENEFITS</div>
              <h2>Safety leaders get answers, not archives</h2>

              {benefitItems.map((item) => (
                <div className="benefit" key={item.title}>
                  <span className="benefit-icon">{item.icon}</span>
                  <div>
                    <strong>{item.title}</strong>
                    <p>{item.text}</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="outcome-dashboard">
              <div className="mini-dashboard">
                <div className="mini-top">
                  <strong>SentinelQHSE</strong>
                  <span>Operational Safety</span>
                </div>
                <div className="mini-stats">
                  <i />
                  <i />
                  <i />
                  <i />
                  <i />
                </div>
                <div className="mini-body">
                  <div className="mini-chart" />
                  <div className="mini-panel" />
                  <div className="mini-heat" />
                  <div className="mini-bars" />
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="product" className="section testimonials">
          <div className="container quote-grid">
            <blockquote>
              <p>
                “We stopped chasing spreadsheets. Every finding now has an owner, a due date and evidence attached to it
                before it closes.”
              </p>
              <footer>
                <strong>HSE Director</strong>
                <span>West African upstream operator (placeholder)</span>
              </footer>
            </blockquote>
            <blockquote>
              <p>
                “The risk forecast flagged heat stress at our flow station a week before we would have noticed the pattern
                ourselves.”
              </p>
              <footer>
                <strong>Operations Manager</strong>
                <span>Gas processing joint venture (placeholder)</span>
              </footer>
            </blockquote>
          </div>
        </section>
      </main>

      <footer id="contact" className="site-footer">
        <div className="container footer-grid">
          <div>
            <a className="brand footer-brand" href="#top">
              <BrandMark />
              <span className="brand-copy">
                <strong>
                  SentinelQHSE<sup>™</sup>
                </strong>
                <small>SAFETY INTELLIGENCE</small>
              </span>
            </a>
            <p>AI-Powered Operational Safety Intelligence Platform for the energy industry.</p>
          </div>
          <div>
            <h4>Platform</h4>
            <a href="#platform">Dashboard</a>
            <a href="#product">Incidents</a>
            <a href="#product">Audits</a>
          </div>
          <div>
            <h4>Company</h4>
            <a href="#contact">Contact sales</a>
            <a href="register.html">Register organization</a>
          </div>
          <div>
            <h4>Access</h4>
            <a href="signin.html">Sign in</a>
            <a href="forgot-password.html">Forgot password</a>
          </div>
        </div>
        <div className="container footer-bottom">© 2026 SentinelQHSE™. All rights reserved.</div>
      </footer>
    </div>
  )
}
