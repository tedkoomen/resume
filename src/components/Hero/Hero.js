import React from "react";

const Hero = ({ height, background, children, style, className }) => (
  <section className={className} style={{ height, background, ...style }}>
    {children}
  </section>
);

export default Hero;
