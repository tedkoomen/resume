import React from "react"
import PropTypes from "prop-types"
import { Link } from "gatsby"
import Header from "../Header/Header"
import "./layout.scss"

const Layout = ({ children }) => (
  <div className="site-shell">
    <a className="skip-link" href="#main-content">
      Skip to content
    </a>
    <Header />
    <main id="main-content" tabIndex={-1}>
      {children}
    </main>
    <footer className="site-footer" aria-label="Site footer">
      <div className="site-footer__status">
        <span>
          <span className="site-footer__prompt" aria-hidden="true">
            ●{" "}
          </span>
          tedkoomen.com <span aria-hidden="true">│</span> engineering notes
        </span>
        <nav className="site-footer__links" aria-label="Footer navigation">
          <Link to="/about-me/">About</Link>
          <a href="/resume/">Resume</a>
          <a
            href="https://github.com/tedkoomen"
            rel="noreferrer"
            target="_blank"
          >
            GitHub ↗
          </a>
          <a
            href="https://www.linkedin.com/in/tedkoomen/"
            rel="noreferrer"
            target="_blank"
          >
            LinkedIn ↗
          </a>
        </nav>
      </div>
      <div className="site-footer__meta">
        <span>© {new Date().getFullYear()} Ted Koomen</span>
        <span>UTF-8 / Screaming Into The Void</span>
      </div>
    </footer>
  </div>
)
Layout.propTypes = { children: PropTypes.node.isRequired }
export default Layout
