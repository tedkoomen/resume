const React = require("react")
const { themeInitScript } = require("./src/utils/theme")

exports.onRenderBody = ({ setHeadComponents }) => {
  setHeadComponents([
    React.createElement("script", {
      key: "theme-init",
      dangerouslySetInnerHTML: { __html: themeInitScript },
    }),
  ])
}
