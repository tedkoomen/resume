---
path: '/blog/engineering/es2020-features'
date: '2020-12-14'
title: "What's new in JavaScript: ES2020"
author: 'Ted Koomen'
dispatch: 16
description: 'New ES2020 features that will make your life easier'
posttype: 'engineering'
tag: ["javascript", "es2020", "es6"]
image: '../../images/engineering-post.png'
featuredImage: '../../images/engineering-post.png'
featured: true
snippet: "ES2020 really helps clean up some pretty dirty code. It allows for engineers to code for edgecases which can look pretty dirty without optional chaning, and allow code to be more performant with dynamic imports."
---

It's been a couple of months since ECMAScript 2020 (ES2020) has been released. ES2020 brings in many new features that JavaScript desparately needs. That being said, it has come to the point where current day ECMAScript does not resemble vanilla JavaScript in the slightest. 

I have mixed feelings on EcmaScript. EcmaScript obviously makes the JavaScript development experience much easier, but I can't call it JavaScript, its for the most part, just syntactic sugar that transpiles to vanilla JavScript. Even though I am a slight hater, I still somehow love it. This post will show 1. What is new with ES2020, and 2. How it makes your life easier. 

# BigInt
This new feature is my second favorite of the new features that come with ES2020. As many know, JavaScript and pre-ES2020 EcmaScript have a problem with large numbers. For pre-ES2020 releases, `Number.MAX_SAFE_INTEGER` is capped at `pow(2, 53) - 1` or 
9,007,199,254,740,991, or just about 9 quadrillion. Now that is for us humans a really big number, especially if we are just writing a blog. We will likely never need to crunch a number that big. With pre-ES2020 releases you can still perform `Number.MAX_SAFE_INTEGER + 1`, but, it is not guaranteed that result will be accurate.

ES2020 brings in a BigInt type that allows for safe operation on larger integers. These BigInt's are denoted with a `n` at the end of the integer:
```javascript
// This is what iit is like pre-ES2020
let oldMax = Number.MAX_SAFE_INTEGER

++oldMax
// 9007199254740992

++oldMax
// 9007199254740992

++oldMax
// 9007199254740992

// post ES2020
let newMax = 9007199254740992n

++newMax
9007199254740993n

++newMax 
9007199254740994n

++newMax
9007199254740995n
```

The `n` which is appended at the very end of the number signifies to the JavScript engine (most likely v8) that this number should be treated differently. If you are running node this would most likely be the same BigInt module used by C++.

It should be noted tht this imporvement is not backwards compatible because the previous number system used is [IEEE754](https://en.wikipedia.org/wiki/IEEE_754).

# Dynamic Import
If you are a React developer, you might look at this feature and say, "Hey, we can already do this". My argument to that would be, yes you can do it, but that is not native to JavaScript, that is a feature you can use with Webpack and Babel.

Dynamic Import will help you implement code splitting without Webpack or other module bundlers. You will also be able to conditionally load code in if-else blocks if you'd like. My favorite benefit of this is importing modules locally so it does not pollute the global environemnt.

```javascript
if (foo) {
  const module = await import('./module.js');
  module.doThing(["foo", "bar"])
}

```

# Null Coalescing
Null coalescing gives the developer the ability to check `nullish` values instead of `falsey` values. JavaScript has many values which are `falsey` i.e empty strings, the number 0, `undefined`, `null`, `false`, `NaN`, and so on.

There are instances where you might want to check if a variable is nullish, either `undefined` or `null`; An instance of this would be when it's okay to have an empty string or a false value.

If this is what you need, you will be able to use the new nullish coalescing operator, `??`.

```javascript
> false ?? 'true value'
> false

> undefined ?? 'some truthy value'
> "some truthy value"

> null ?? 'some truthy value'
> "some truthy value"

> NaN ?? "some truthy value"
> NaN

// compared to ||

> false || 'some truthy value'
> "some truthy value"

> undefined || "some truthy value"
> "some truthy value"

> null || "some truthy value"
> "some truthy value"

> NaN || "some truthy value"
> "some truthy value"
```

The difference between the OR (`||`) operator and the nullish (`??`) operator is tha tthe OR operator always returns the truthy value whereas the nullish operator returns the non-null type.

# Optional Chaining
Optional chaning allows you to access nested object properties without worrying if the property exists or not. We have this in Ruby like this:
```ruby
require 'ostruct'
person = OpenStruct.new({name: "Ted"})

> person.name
> "Ted"
> person.occupation.company
> undefined method 'company' for nil:NilClass (NoMethodError)
```

This error pops up due to the fact that the `occupation` propery is `nil`, and `nil` does not have a property `company`. We can think of these "properties" as functions that are returning a value.

Now if we are in JavaScript land and we run:
```javascript
const person = {
  name: "Ted"
}

> person.occupation.company
```

we would receive a similar error `TypeError: Cannot read property 'company' of undefined.` In this case occupation is `undefined`.

Normally we would have to introduce `null` checking to access deeply nested attributes:
```javascript
const person = {
  name: "Ted"
}

const getPersonCompany = person = null => {
  if(!person.occupation) {
    return false
  }

  return person.occupation.company
}

```

Now this isn't the best architecture or naming for this piece of code, but we will ignore that for now.

As you may realize, we may have a very deeply nested object and this would be difficult to scale. If we were able to take advantage of optional chaning it would look something like this:

```javascript
const person = {
  name: "Ted"
}

const getPersonCompany = person => person?.occupation?.company
```

This is much much much cleaner. What is actually interesting is that the code that is actually compiled looks something like
```javascript
const getPersonCompany = person => {
  if (person) {
    if (person.occupation) {
      if (person.occupation.company) {
        return person.occupation.company
      } else {
        return null
      }
    } else {
      return null
    }
  } else {
    return null
  }
}
```

^ This is just terrifying.

# Promise.allSettled

I wont go too far into Promises, but [here](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise) is a good write up of what Promises are. 

The `Promise.allSettled` method accepts a list of Promsies and only resolves when all of them are settled (resolved or rejected).

There were some close implementations such as `race`, we have seen this in [redux-saga](https://redux-saga.js.org/) as well, but with ES2020 we have native support.

```javascript
const promiseArray = [
  Promise.resolve(100),
  Promise.reject(null),
  Promise.reject(new Error('Error'))
]

Promise.allSettled(promiseArray).then(results => {
  console.log(results)
})
```

# String#matchAll
`matchAll` is a method added to the `String` prototype which helps us with Regular Expressions. `matchAll` returns an iterator which returns all groups that match the regexp.

```javascript
> const regexp = /[a-c]/g;
> const str = 'abc';
> const iterator = str.matchAll(regexp);
> Array.from(iterator, result => console.log(result))

> ["a", index: 0, input: 'abc', groups: undefined]
> ["b", index: 1, input: 'abc', groups: undefined]
> ["c", index: 2, input: 'abc', groups: undefined]
```

# globalThis

If you have worked wtih cross-platform JS which could run on Node, your browser environment, and inside web-workers, you would have a difficult time finding a global object. 

This is because each global object is different from environment to environment. For browsers the global object is `window`, `global` for Node, and `self` for web-workers. ES2020 brings `globalThis` which refers to each global object no matter where you are executing your code.

# Module Namespace Exports
For JavaScript modules, it was possible to import modules with the following syntax:
```javascript
import * as utils from './utils.js`
```

Now we can use the same syntax to export modules:
```javascript
export * as utils from './utils.js'
```
# Conclusion
As you can see, ES2020 really helps clean up some pretty dirty code. It allows for engineers to code for edgecases which can look pretty dirty without optional chaning, and allow code to be more performant with dynamic imports. Next in the series on JavaScript I will review Promises!

