---
path: '/blog/engineering/metaprogramming-ruby'
date: '2020-09-18'
title: 'Metaprogramming in Ruby Part I'
author: 'Ted Koomen'
dispatch: 14
description: 'Metaprogramming and its relation to the cuttlefish.'
posttype: 'engineering'
tag: ["ruby", "ruby on rails", "metaprogramming"]
featured: true
image: '../../images/ruby-banner.png'
snippet: "If you have worked in Ruby on Rails you have been using many methods that are a result of metaprogramming!"
featuredImage: 'images/ruby-banner.png'
---

You may be asking yourself "why is there a cuttlefish with a ruby hanging off of its head" or "what does this have to do with metaprogramming at all?".
In all honesty that is a fair question, and please excuse the low quality attempt at finding a picture of a cuttle fish with a ruby on its head to satisfy my own desires.

Lets get to what brought you here, you probably are curious on what metaprogramming is, why it might be useful, and why this post is Ruby centric.

### Metaprogramming: A VERY BASIC introduction
According to the fountain of knowledge known as Wikipedia:
>  _Metaprogramming is a programming technique in which computer programs have the ability to treat other programs as their data._
> 
> --- [Metaprogramming, Wikipedia](https://en.wikipedia.org/wiki/Metaprogramming)

Great, there it is, good luck.

But seriously, what does this mean? How can you use programs as data? Lets look at what we normally think of as "data".

#### What is data?
We most often think of data as information that we receive from an API or a query from our database. 
More specifically, I most often think of data as something that we want to present to the user, or a piece of information that is used to make a decision.
If I'm not making myself clear, here is a code snippet showing how I view data:
```ruby
class User
  def initialize(name)
    self.name = name
  end
end

module Greeter
  def say_hello(person)
    if person.name == "Ted"
      "Go away!"
    else
      "Hello, #{person.name}!"
    end
  end
end

person = User.new("Ted")
Greeter.say_hello(person)
# returns "Go away!"
```

In this snippet I am treating the person object's name as a piece of information to make a decision in the persuit of presenting information to the user.
Throughout my short career I have treated data in this way almost exclusively. 

#### Back to Metaprogramming
So now how do you treat programs as data, and why would you do that? 
If you have worked in Rails you have been using many methods that are a result of metaprogramming. Lets say you have a user defined similar to the one above, but with a couple of key differences:

```ruby
require 'ostruct'

class User
  attr_accessor :first_name, :last_name, :occupation, :preferred_greeting
  
  def initialize(params)
    set_attr_readers(params)
  end

  def user
    OpenStruct.new(
      first_name: first_name, 
      last_name: last_name, 
      occuptation: occupation, 
      preferred_greeting: preferred_greeting
    )
  end

  def method_missing(method_name, *arguments, &block)
    if method_name.to_s =~ /user_(.*)/
      user.send($1, *arguments, &block)
    else
      super
    end
  end

  def respond_to_missing?(method_name, include_private = false)
    method_name.to_s.start_with?('user_') || super
  end

  private

  def set_attr_readers(params)
    params.each do |key, value|
      instance_variable_set("@#{key}", value)

      define_singleton_method(key) {
        instance_variable_get("@#{key.to_s}")
      }
    end
  end
end

person = User.new({
  first_name: "Ted",
  last_name: "Koomen",
  preferred_greeting: "Hello",
  occupation: "Software Engineer"
})

person.user_first_name # > "Ted"
```
So what is going on here? First, we defined `user` as an OpenStruct to kind of mock a database. Next we defined set\_attr\_readers. What does this do? This is an example of metaprogramming. The method set_attr_readers initializes a method for each property that is passed to the user object on initialization. We could pass `school: 'SUNY Albany` on initialization and we would have an instance variable and a attr\_reader waiting for us. 

We then defined two weird looking methods, `method_missing` and `respond_to_missing?`; what do these do?
In the last sentance I said we defined the method `method_missing`, that is actually a lie. What we are doing is overwriting the existing `method_missing` method which is given to us by the `Kernel` class, which is a class that every single object in Ruby inherits from; **everything** is an object in Ruby. 
So for the purposes of each instnace of our `User` class we overwrote the `method_missing` method to check if the method that we called started with user_, and if it matches, take the part of the string that didn't match (`$1`), [send](https://apidock.com/ruby/Object/send) the attribute getter to the class, and return the value.
While this is not the best example, it encapsulates a basic element of metaprogramming. We can see this kind of metaprogramming when working in Ruby on Rails when we call:
```ruby
User.find_by_email('foo@bar.com')
```
ActiveRecord, the ORM of choice will overwrite the `method_missing` class, and do something similar, albeit, more complex as what we did above.

### So Why?
Metaprogramming gives you a great way to write extremely readable code. To find by email we could write a method like:
```ruby
class User
  def find(params)
  ...
  # Does work
  end

  def self.find_by_email(email)
    self.find(email: email)
  end
end

User.find_by_email("foo@bar.com")
```
This may seem like a good idea, but it is not always scalable. We could have hundreds of properties we want to search by, but we don't necessarily want to impliment and test every single method. This is a benefit of metaprogramming, we have the runtime do all the work for us.

#### So how does this relate to the cuttlefish?
When I think of metaprogramming I think of changes made to a program at runtime, meaning the program can change in real time based on its inputs. The cuttlefish is much the same. [Video Evidence](https://www.youtube.com/watch?v=Ojb1pxcSr5E)

## Conclusion
What we have seen are the absolute basics of metaprogramming. In my opinion, the biggest benefit to metaprogramming is that you are able to define an arbitrary amount of methods at runtime in the naming convention of your choice; you do not have to _impliment_ every single method. The biggest draw back to me is the debugging process, and metaprogramming's _magic_. When first starting out in Rails you are faced with a lot of metaprogramming behind the scenes. 

It is hard to determine what is a defined method and what is being made for you. From my experience it made me take for granted methods that are not provided in every class.

I would most recommend metaprogramming to beginners of Ruby and Ruby on Rails, so it is clear what is Rails magic and what is vanilla Ruby.

Keep a lookout for a more advanced Part II !