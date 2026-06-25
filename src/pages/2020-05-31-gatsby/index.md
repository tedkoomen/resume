---
path: '/blog/engineering/create-gatsby-blog'
date: '2020-05-31'
title: 'Gatsby Starter'
author: 'Ted Koomen'
dispatch: 13
description: 'Using Gatsby to create your own 
personal website and blog.'
posttype: "engineering"
image: '../../images/engineering-post.png'
tags: ["javascript", "gatsby", "react"]
featured: false
test: false
snippet: 'The Creators of Gatsby describe their product as "Gatsby is a free and open source framework based on React that helps developers build blazing fast websites and apps".' 
featuredImage: '../../images/engineering-post.png'
---


[The Creators](https://www.gatsbyjs.org/) of Gatsby describe their product as "a free and open source framework based on React that helps developers build blazing fast websites and apps". So what does that even mean? It seems as though every framework or library claims to be blazing fast and scalable. What Gatsby is, is a *Static Site Generator*. Great, so what is that?

A static site generator is what it sounds like, static, fixed, not changing. In more clear terms, it means that all the content that a user could see on the web page is already created. A dynamic website will generate a page on the fly and then serve that page to the user. Page data is stored somewhere in a database, is then accessed, that data is filled into a template, and then served to the user. Dynamic websites are great, but there are tradeoffs, such as security, and potential performance issues.

As stated before, Gatsby is a static site generator, but it does things slightly differently. Gatsby utilizes [React](https://reactjs.org/), as apposed to something like [Jekyll](https://jekyllrb.com/) which is Ruby based. What Gatsby has that Jekyll doesn't is that Gatsby generates Progressive Web Apps. This allows Gatsby to have great SEO, and what I find most convenient, allow for offline usage. I chose Gatsby not for those reasons, but their extensive list of [plugins](https://www.gatsbyjs.org/plugins/), which allow for using styled components, image processing, markdown rendering, and so much more.

After all of that, lets get into a simple set-up.

## The worst part about Gatsby is the learning curve
Partly in thanks to being extremely feature rich, Gatsby has a pretty high learning curve and set up time as compared to its Ruby counterpart Jekyll. Like many static websites, we need to use an external data source during the build process. Gatsby provides support for many forms of data including CMSs (WordPress, Contentul), APIs, and Markdown. To be able access this data, Gatsby uses GraphQL. 

If you already know GraphQL, accessing data from whatever data source you are using feels intuitive. If you don't know GraphQL, then that is another thing to learn, which has its own learning curve and may seem daunting.


## Building Your Blog

#### Install Gatsby CLI
If it isn't obvious, if you don't already have it, the first thing you want to do is to install the gatsby-cli, and make sure you have [Node](http://www.nodejs.org) and [Git](https://www.atlassian.com/git/tutorials/install-git#mac-os-x) installed globally. After having these dependencies, you can go ahead and run:

```bash
  yarn add gatsby-cli
```

#### Create new Gatsby Site
After the above code is executed, you can go ahead and create your first gatsby site

```bash
  gatsby new [insert-your-project-name-here] && cd [insert-your-project-name-here]
```

#### Start the development server
```bash
  gatsby develop
```

After these steps, you can go ahead an see what Gatsby gives you out of the box. Navigate to `localhost:8000` and you should see a landing page build for you by gatsby. 

#### Gatsby Folder Architecture
Gatsby builds a folder structure very similar to what any developer could be sued to. Here is the folder structure that we have to work with:
```md
  |-- /node_modules
  |-- /src
    |-- /components
      |-- header.js
      |-- image.js
      |-- layout.css
      |-- layout.js
      |-- seo.js
    |-- /images
      |-- gatsby-astronaut.png
      |-- gatsby-icon.png
    |-- /pages
      |-- 404.js
      |-- index.js
      |-- page-2.js
      |-- using-typescript.tsx
  .gitignore
  .prettierignore
  .prettierrc
  gatsby-browser.js
  gatsby-config.js
  gatsby-node.js
  gatsby-ssr.js
  LICENSE
  package.json
  README.md
  yarn.lock
```

There are four important files for a Gatsby site:

`gatsby-config.js` - configure options and plugins for Gatsby
`gatsby-node.js` - Gatsby Node.js API for customizing the build process
`gatsby-browser.js` - Gatsby brownser API for customizing default browser settings
`gatsby-ssr.js` - Gatsby server-side rendering customizations

## Okay thats great, how do I actually use these tools?
Gatsby will automatically create pages from React components in `src/pages` into pages with URL addresses. For example, `index.js` would route to `localhost:8000/` and `about.js` would route to `localhost:8000/about`. Under the hood, Gatsby uses [React Router](https://reacttraining.com/react-router/) to handle browser history.


### Blogs
Now let's add some blogs!

##### Adding Blog Posts
Inside of the `pages/` directory, create a folder `2020-05-29-first-blog`.
Inside this folder add a file `index.md` with the following content: 
```markdown
---
path: '/first-blog'
date: '2020-01-01'
title: 'This is my first blog'
author: 'Calvin Broadus'
description: 'Drop it like its hot'
---

Here is my amazing blog post with all of this great content.


Lorem ipsum dolor sit amet consectetur adipisicing elit. Ea dignissimos	Lorem ipsum dolor sit amet consectetur adipisicing elit. Ea dignissimos
aut consequuntur aspernatur corrupti ratione, odit similique tenetur	aut consequuntur aspernatur corrupti ratione, odit similique tenetur
accusantium, est nostrum esse minus iure voluptatum nihil cumque	accusantium, est nostrum esse minus iure voluptatum nihil cumque
blanditiis non? Odit.	blanditiis non? Odit.
```

Everything between the three hyphens is called `frontmatter`. This acts as the meta-data for your blog posts. Each blog post should contain at least
- `path`: The URL for the blog post
- `date`: The date when the blog post was published
- `author`: The blog post author
- `description`: The description of the blog post

Everything after the closing hyphens are the actual body of the post.

##### Rendering a List of Blog Posts
Now that we have a blog post we want the whole world to see, we want to render them in our `blog.js` page. First, lets create that page.

in the `pages/` directory, lets create `blog.js`, and include the following code:
```jsx
  // pages/blog.js
  import React from "react"
  export default () => (
    <>
      <h1> Blog</h1>
    </>
  )
```

After we create this file. We can navigate to `localhost:8000` and see we made our first page!

Now we need to install some new dependencies to actually be able to parse and render our blogs written in markdown.

```shell
  yarn add gatsby-transformer-remark
```

Then, in `gatsby-config.js` add `gatsby-transformer-remark` in the array of plugins.

```js
  // gatsby-config.js
  plugins: [
    ...
    `gatsby-transformer-remark`
    ...
  ]
```

Now we also need to add another plugin for `gatsby-soruce-file-system` to instruct GraphQL where to find our blog posts: the `pages/` directory.

```js
  // gatsby-config.js
  {
    plugins:[
      ...
      {
        resolve: `gatsby-source-filesystem`,
        options: {
          name: `pages`,
          path: `${__dirname}/src/pages`
        },
      },
      ...
    ]
  }
```

Now, restart your development server, and then head over to `http://localhost:8000/___graphql`
Thankfully, Gatsby comes configured with GraphQL which means we have access to GraphiQL; an in browser IDE for GraphQL.

To retrieve all of our blog posts we will use the `AllMarkdownRemark` plugin. In the GraphiQL panel, select:
```graqphql
  AllMarkdownRemark > edges > node > frontmatter > date title
```

Now press the play button, and you should see the blog post data in the panel on the right.
Next thing to do is copy this GraphQL query, and we will bring it over to `blog.js`

First thing we want to do in `blog.js` is import `graphql` from gatsby

```jsx
  // blog.js
  ...
  import { graphql } from "gatsby";
  ...
```

Now, after the blog export, add the following code, paste the GraphQL query that we just ran in GraphiQL where it says `<<QUERY HERE>>`

```jsx
  export const AllBlogsQuery = graphql`
    <<QUERY HERE>>
  `
```

My query is the following (it may look different, it is the query that brought you here!)

```jsx
export const AllEngineeringBlogsQuery = graphql`
  query AllEngineeringPosts {
   allMarkdownRemark(filter: {
     frontmatter: {
       posttype: {
         eq: "engineering"
        }
      }
    }
    ) {
    edges {
      node {
        frontmatter {
          date(formatString: "MMMM DD YYYY")
          title
          tags
          author
          path
          posttype
        }
      }
    }
  }
  }
`
```

One thing to keep in mind, GraphQL queries must be unique, so be mindful of your query names.

The next thing we have to do is pass `data` from the query as a parameter to the blog page.
```jsx
  // blog.js
  ...
  const Blog = ({ data }) => (
    <h1>Blog</h1>
  )
```


##### Dynamically Creating A List Of Blogs
Our next step to show our users what blogs we have published is to iterate over our blog data and create nodes for each of them.

Create a new file called `Post.js`

`Post` will take five arguments:
- `title`
- `author`
- `description`
- `date`
- `path`

```jsx
  // Post.js
import React from "react";
import { Link } from "gatsby";
const Post = ({ 
  title, 
  author, 
  date, 
  description, 
  path 
  }) => (
  <div className="post">
    <h3 className="post-title">{ title }</h3>
    <p className="post-description">{ description }</p>
    <p className="post-written-by">
      Written by { author } on { date }
    </p>
    <Link to={ path }>Read more</Link>
  </div>
);
export default Post;
```

Now in `blog.js` we can import `Post` and render a new post for each post that we have.

```jsx
  // blog.js
  ...
  import Post from "../components/Post";
  ...
  const Blog = ({ data }) => (
    <>
      <h1>Blog</h1>
      {
        data.allMarkdownRemark.edges.map(post => {
          const {
            title,
            author,
            date,
            description,
            path
          } = post.node.frontmatter
          return (
            <Post
              title={title}
              author={author}
              date={date}
              description={description}
              id={`${title}__${description}`}
              path={path}
            />
          )
        })
      }
    </Post>
  )
```

##### Dynamically Generating Blog Post Pages
If you can believe it, now we are on to the more complicated part. We have to create a page for every single blog post that we have. We just created a `blog#index` page, but now how do we make a `blog#show`? If we were in Ruby on Rails, we might just pass a blog ID, the database will work its magic, and then we would fill out our template. 

Gatsby, along with node.js provides us an interface for dynamically generating pages.
Lets create the GraphQL query for retrieving data for a specific blog post.

When we created the schema for retrieving all blog posts, we used `allMarkdownRemark`. This time we will use `markdownRemark`.

Back to GraphiQL, lets select
```graphql
  # be sure to select the purple `frontmatter` option, it is an argument instead of a field name
  markdownRemark > frontmatter(purple) > path > eq: "_"
```

This is telling graphQl that we will select a specific blog by its path, which will be passed as a parameter. 

Next, lets go back to GraphiQL and select
```graphql
  markdownRemark > html, frontmatter (blue) > author date path ti
```

Next, wherever we are passing an argument to markdownRemark, we have to give GraphQL an `eq` value to look for. In our case this is the `path`. 
```jsx
query BlogPost($path: String!) {
  markdownRemark(frontmatter: { path: eq: $path }}) {
    frontmatter {
      author
      date
      title
      path
    }
    html
  }
}
```

`String!` tells GraphQL that the path argument is of type `String` and is required.

Now that we have our query, what do we do?

Lets build a template which will determine how each blog post should be structured.
In the `src/` directory, create a new folder called `templates` and add a file called `blogTemplate.js`

Now we need to include some imports

```jsx
// templates/blogTemplate.js
import React from "react";
import { graphql, Link } from "gatsby"
```

Next, lets create a component
```jsx
// templates/blogTemplate.js
...
export default ({ data }) => {
  const post = data.markdownRemark;
  const { title, author, date } = post.frontmatter;
return (
  <>
    <Link to="/">Back to blogs</Link>
    <h1>{title}</h1>
    <p>Posted by {author} on {date}</p>
    <div dangerouslySetInnerHTML={{ __html: post.html }} />
  </>
)
};
export const postQuery = graphql`
  query BlogPost($path: String!) {
    markdownRemark(frontmatter: { path: { eq: $path }}) {
      frontmatter {
        author
        date
        title
        path
      }
      html
    }
  }
`;
```

Now that we have our template, lets put it to work. We have to instruct Gatsby to dynamically generate pages for each blog posts, so lets go to `gatsby-node.js`

First, we require the `path` module.

```js
// gatsby-node.js
const path = require('path')
```

We're going to use the `exports.createPages` module to generate our pages.

```js
// gatsby-node.js
...
exports.createPages = ({ boundActionCreators, graphql }) => {
  const { createPages } = boundActionCreators;
  const postTemplate = path.resolve('src/templates/blogTemplate.js');
}
```

We now have to return a query to get all the blog posts. We already have this query from a previous step, so now all we need for each post is its `path`

```js
// gatsby-node.js
  ...
  return graphql(`
    {
      allMarkdownRemark {
        edges {
          node {
            frontmatter {
              path
            }
          }
        }
      }
    }
  `)
```

Once we receive our data from the query, we want to reject if an error occurred, else create a page for each post.

This will create a post at the path received from the query data, and we will use the `postTemplate` we created to render each post.

```js
// gatsby-node.js
...
return graphql(`
    {
      allMarkdownRemark {
        edges {
          node {
            frontmatter {
              path
            }
          }
        }
      }
    }
  `).then(res => {
    if (res.errors) { return Promise.reject(res.errors) }
    res.data.allMarkdownRemark.edges.forEach(({ node }) => {
    createPage({
      path: node.frontmatter.path,
      component: postTemplate
    })
  })
```
This is the completed file:
```js
// gatsby-node.js
const path = require("path");
exports.createPages = ({ boundActionCreators, graphql }) => {
  const { createPage } = boundActionCreators;
  const postTemplate = path.resolve("src/templates/blogTemplate.js");
  return graphql(`
    {
      allMarkdownRemark {
        edges {
          node {
            frontmatter {
              path
            }
          }
        }
    }
  }
  `).then(res => {
    if (res.errors) {
      return  Promise.reject(res.errors)
    }
    res.data.allMarkdownRemark.edges.forEach(({ node }) => {
      createPage({
        path: node.frontmatter.path,
        component: postTemplate,
      })
    })
  })
};
```
Now lets check our work!
Re-start your development server, and click on one of the blog post "Read more" links. 
We should finally be seeing a blog post!!!!
## Thoughts on Gatsby
To just create a simple blog this seems way over engineered and complex. I would have to agree to a certain extent. Where Gatsby shines is not it's set up time, but when you have your site all set up. Gatsby offers incredible performance and configuration, where another product might leave you with great ease of set up, but leave you wanting more in configuration.
## Conclusion
That's it! I hope I was somewhat clear in making your first Gatsby blog. I have to give credit to [Emma Bostian](https://ultimatecourses.com/blog/building-a-blog-with-gatsby-and-graphql) as this was the blog I followed in creating my Gatsby site. 
Please contact me on Twitter if you have any questions!
