import React from "react"
import { Link } from "gatsby"
import Layout from "../components/Layout/Layout"
import SEO from "../components/seo"

export default function NotFound() {
  return <Layout>
    <SEO title="Page not found" noindex />
    <section className="home-masthead">
      <p>404 / Page not found</p>
      <h1>This page isn’t here.</h1>
      <p><Link to="/">Return to the writing →</Link></p>
    </section>
  </Layout>
}
