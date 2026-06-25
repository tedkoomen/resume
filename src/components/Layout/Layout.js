import React from "react";
import PropTypes from "prop-types";
import { Link } from "gatsby";
import Header from "../Header/Header";
import "./layout.scss";

const Layout = ({ children, path }) => {
  return (
    <div className="site-shell">
      <Header path={path} />
      <main>{children}</main>
      <footer className="site-footer" aria-label="Site footer">
        <div className="site-footer__meta">
          <span>© 2026 Ted Koomen</span>
          <span>Built with Gatsby. Hosted on Netlify.</span>
        </div>
        <div className="site-footer__mark" aria-hidden="true" />
        <nav className="site-footer__links" aria-label="Footer navigation">
          <Link to="/about-me/">About</Link>
          <Link to="/resume/">Resume</Link>
          <a href="https://github.com/tedkoomen" rel="noreferrer" target="_blank">
            GitHub
          </a>
          <a href="https://www.linkedin.com/in/tedkoomen/" rel="noreferrer" target="_blank">
            LinkedIn
          </a>
        </nav>
      </footer>
    </div>
  );
};

Layout.propTypes = {
  children: PropTypes.node.isRequired,
  path: PropTypes.string,
};

Layout.defaultProps = {
  path: undefined,
};

export default Layout;
