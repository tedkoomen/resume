import React from "react";
import Layout from "../components/Layout/Layout";
import Seo from "../components/seo";
import "./resume.scss";

const Resume = () => (
  <Layout>
    <Seo title="Resume" />
    <section className="resume-page">
      <header className="resume-hero">
        <p className="resume-hero__kicker">Resume</p>
        <div className="resume-hero__grid">
          <div>
            <h1>Ted Koomen</h1>
            <p className="resume-hero__role">Senior Software Engineer</p>
            <p className="resume-hero__summary">
              Building backend systems, stream-processing pipelines, and
              software that has to keep working when the abstractions leak.
            </p>
          </div>
          <ul className="resume-contact" aria-label="Contact links">
            <li>New York, New York</li>
            <li>
              <a href="mailto:koomen.ted@gmail.com">koomen.ted@gmail.com</a>
            </li>
            <li>
              <a href="https://www.tedkoomen.com" rel="noreferrer" target="_blank">
                tedkoomen.com
              </a>
            </li>
            <li>
              <a href="https://github.com/tedkoomen" rel="noreferrer" target="_blank">
                github.com/tedkoomen
              </a>
            </li>
            <li>
              <a href="https://www.linkedin.com/in/tedkoomen/" rel="noreferrer" target="_blank">
                linkedin.com/in/tedkoomen
              </a>
            </li>
          </ul>
        </div>
      </header>

      <section className="resume-section">
        <h2>Profile</h2>
        <div className="resume-section__body">
          <p>
            Software engineer with experience across startups and larger
            organizations. Focused on scalable backend services, APIs,
            asynchronous mechanisms, stream processing, and technical writing
            about systems, AI, and performance.
          </p>
        </div>
      </section>

      <section className="resume-section">
        <h2>Selected Work</h2>
        <div className="resume-section__body resume-timeline">
          <article>
            <p className="resume-timeline__date">Recent</p>
            <div>
              <h3>Backend Systems & Stream Processing</h3>
              <p>
                Designed and implemented backend services for high-volume data
                flows, asynchronous workflows, and operationally sensitive user
                experiences.
              </p>
            </div>
          </article>
          <article>
            <p className="resume-timeline__date">Healthcare</p>
            <div>
              <h3>COVID-19 Test Ordering Platform</h3>
              <p>
                Engineered ordering capabilities for COVID-19 testing for the
                State of Connecticut, supporting high daily test volume during a
                critical period.
              </p>
            </div>
          </article>
          <article>
            <p className="resume-timeline__date">Frontend</p>
            <div>
              <h3>Framework Modernization</h3>
              <p>
                Led a team of engineers in revamping the frontend framework of
                a large consumer-facing organization and improved performance of
                a major genetic testing provider.
              </p>
            </div>
          </article>
        </div>
      </section>

      <section className="resume-section resume-section--columns">
        <h2>Skills</h2>
        <div className="resume-section__body resume-skills">
          <div>
            <h3>Systems</h3>
            <p>Backend services, APIs, stream processing, async workflows</p>
          </div>
          <div>
            <h3>Languages</h3>
            <p>JavaScript, Ruby, SQL, C++, Zig</p>
          </div>
          <div>
            <h3>Writing</h3>
            <p>Distributed systems, AI, performance, engineering tradeoffs</p>
          </div>
        </div>
      </section>

      <section className="resume-section">
        <h2>Download</h2>
        <div className="resume-section__body">
          <a
            className="resume-download"
            href="https://personalsite-koomen.imfast.io/ted_koomen_resume.pdf"
            rel="noreferrer"
            target="_blank"
          >
            Open PDF résumé →
          </a>
        </div>
      </section>
    </section>
  </Layout>
);

export default Resume;
