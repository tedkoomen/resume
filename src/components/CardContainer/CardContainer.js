import React from "react";
import Card from "../Card/Card";
import "./cardContainer.scss";

const CardContainer = ({ containerTitle, data }) => {
  const renderContainerTitle = () => {
    if (!containerTitle) {
      return null;
    }

    return <h2 className="dispatch-list__title">{containerTitle}</h2>;
  };

  const renderCards = () =>
    data.map((obj, index) => (
      <Card data={obj} issue={data.length - index} key={obj.node.frontmatter.path} />
    ));

  return (
    <section className="dispatch-list">
      <div className="dispatch-list__header">{renderContainerTitle()}</div>
      <div className="dispatch-list__items">{renderCards()}</div>
    </section>
  );
};

export default CardContainer;
