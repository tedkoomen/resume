import React from "react"
import { Link } from "gatsby"
import ThemeToggle from "./ThemeToggle"
import "./header.scss"

const Header = () => (
  <>
    <header className="site-header">
      <Link className="site-header__brand" to="/" aria-label="Critical Section — Ted Koomen home">
        <span>Critical Section</span>
        <small>by Ted Koomen</small>
      </Link>
      <nav className="site-header__nav" aria-label="Primary navigation">
        <Link to="/" activeClassName="is-active">Writing</Link>
        <Link to="/about-me/" activeClassName="is-active">About</Link>
        <a href="/resume/">Resume</a>
        <ThemeToggle />
      </nav>
    </header>
    <p className="site-tagline">Notes on software, systems, and tradeoffs.</p>
  </>
)
export default Header
