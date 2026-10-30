import React from "react"
import { Link } from "gatsby"
import ThemeToggle from "./ThemeToggle"
import "./header.scss"

const Header = () => (
  <header className="site-header">
    <Link
      className="site-header__brand"
      to="/"
      aria-label="Ted Koomen — Screaming Into The Void home"
    >
      <span className="site-header__prompt" aria-hidden="true">
        ~/{" "}
      </span>
      tedkoomen
    </Link>
    <nav className="site-header__nav" aria-label="Primary navigation">
      <Link to="/" activeClassName="is-active">
        [ writing ]
      </Link>
      <Link to="/about-me/" activeClassName="is-active">
        about
      </Link>
      <Link to="/resume/" activeClassName="is-active">
        resume
      </Link>
      <Link to="/blog/" activeClassName="is-active">
        archive
      </Link>
      <ThemeToggle />
    </nav>
  </header>
)
export default Header
