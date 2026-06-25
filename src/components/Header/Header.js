import React from "react";
import { Link } from "gatsby";
import "./header.scss";

const Header = () => {
  const links = [
    { path: "/", text: "Articles" },
    { path: "/about-me/", text: "About" },
    { path: "/resume/", text: "Resume" },
    { path: "/blog/", text: "Archive" },
  ];

  return (
    <header className="site-header">
      <Link className="site-header__brand" to="/" aria-label="Screaming Into The Void home">
        <span className="site-header__mark" aria-hidden="true" />
        <span className="site-header__wordmark">Screaming Into The Void</span>
      </Link>
      <nav className="site-header__nav" aria-label="Primary navigation">
        {links.map((link) => (
          <Link activeClassName="is-active" key={link.path} to={link.path}>
            {link.text}
          </Link>
        ))}
      </nav>
    </header>
  );
};

export default Header;
