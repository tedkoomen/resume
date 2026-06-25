---
path: '/blog/engineering/sorting-with-ruby'
date: '2020-10-26'
title: 'Basic Sorting Algorithms in Ruby'
author: 'Ted Koomen'
dispatch: 15
description: 'Sorting algorithms that you will encounter in an introduction class to computer science'
posttype: 'engineering'
tag: ["ruby", "sorting", "algorithms", "faang"]
featuredImage: 'images/ruby-banner.png'
image: '../../images/ruby-banner.png'
featured: true
---

For the last few days I've been bedridden with a thrown back. After countless hours of sleeping, and feeling sorry for myself about a cancelled trip I said to myself, "You know what would be fun? Writing a blog post about sorting algorithms". You know what, thats what I'll do.

## Intro
Sorting is one of, if not the most, used functions in anything you might build. Think of any website or app you have used whether it be Google, Facebook, Twitter, Reddit, Evernote, or even just a text messaging app, you will notice that all of your content is sorted. These applications content might not all be sorted the same (Facebook will sort posts based on what you might be interested in), but none the less, they are sorted.

Besides Reddit and your standard text messaging app, the applications that I listed have impossibly complex sorting algorithms that not one person can parse through or completely comprehend, but they are all built on at least one of these algorithms that I will go through.  

## Algorithms

### Bubble Sort
To me, and maybe the rest of the dev community bubble sort is the easiest to reason, and the exact algorithm that you do not want to use, especially in a job interview. To clarify, in a job interview, it is okay to bring up using bubble sort, but, you want to explain why it is not optimal, which I will discuss.

Bubble sort is fairly straight forward. In this case we will take in an array, for now lets just assume it is an array of integers, and for each element in the array, we want to compare the current element to the next element, and if the current element is greater than the next element, we want to swap these elements.
We want to perform this operation for each element in the array.

```ruby
def sort(array)
  return array if array.length <= 1
  (array.length - 1).times do |x|
    curr_idx = x
    next_idx = x + 1
    if array[curr_idx] > array[next_idx]
      array[curr_idx], array[next_idx] = array[next_idx], array[curr_idx]
    end
  end
  
  array
end
```

When I first learned of bubble sort, this is what I thought the implimentation was based on the algorithm description. To me, this algorithm will "bubble up" the larger elements and "bubble down" the smaller elements.
Lets assume we have an array that looks like `[1,3,2]` and walk through what is happening.

```markdown
First pass:
- x = 0
- curr_idx = 0
- next_idx = 1
- array[curr_idx] is not greater than array[next_idx]

Second pass:
- x = 1
- curr_idx = 1 
- next_idx = 2
- array[curr_idx] is greater than array[next_idx]
```
There will be no third pass as we perform this action array.length - 1 (in this case 2) times.

So this looks good and will pass for this test case, but what if our test case is the array of `[3,1,2,0]`.

```markdown
First pass:
- x = 0
- curr_idx = 0
- next_idx = 1
- array[curr_idx] is greater than array[next_idx]
  - swap

array = [1,3,2,0]
Second pass:
- x = 1
- curr_idx = 1
- next_idx = 2
- array[curr_idx] is greater than array[next_idx]
  - swap

array = [1,2,3,0]

Third pass:
- x = 2
- curr_idx = 2
- next_idx = 3
- array[curr_idx] is greater than array[next_idx]
  - swap

returns: [1,2,0,3]
```

As we see here, this is obviously not sorted, so what are we missing? 
What we are missing is a flag that indicates whether or not a swap occurred during a pass of the array.
```ruby
def sort(array)
  return array if array.length <= 1
  swap = true
  while swap
    swap = false
    (array.length - 1).times do |x|
      curr_idx = x
      next_idx = x + 1
      if array[curr_idx] > array[next_idx]
        swap = true
        array[curr_idx], array[next_idx] = array[next_idx], array[curr_idx]
      end
    end
  end

  array
end
```

Here we create a variable `swap` to indicate when a swap occured. If a swap did not occur, then the array is sorted.
I dont want to bore you with a longer step through of this test case, it would be much longer than the last, so here is a [sandbox](https://repl.it/talk/share/Bubble-Sort/60069) to play around with.

#### Runtime
As I said before, bubble sort is not optimal in any sense of the word. For each element in the array, bubble sort compares every pair of elements, giving it a worst case and average time complexity of O(n ^ 2), with a space of O(n) since we are modifying in place.
More optimal sorting algorithms perform in O(n log n), making this extremely suboptimal.

### Insertion Sort
Insertion sort will walk through an array looking for a number that is smaller than the number we are iterating over. If we find that number, we need to determine where it should be placed by comparing it to all numbers that have been sorted and are to the left of the number we are iterating over.
![](https://res.cloudinary.com/practicaldev/image/fetch/s--cSx_VEx5--/c_limit%2Cf_auto%2Cfl_progressive%2Cq_auto%2Cw_880/https://dev-to-uploads.s3.amazonaws.com/i/dimgwazb9kowhoe1i7u2.png)

All of the numbers that are greater than the element we are iterating over will be shifted to the right to make space for the sorted element. This array is basically broken in half, one side sorted, and one side unsorted. Insertion sort will move across the unsorted portion and insert the elements where they should belong, until the array is sorted.

```ruby
def insertion_sort(array)
  return array if array.length <= 1

  for i in 1...(array.length)
    value = array[i]
    temp = i
    while temp > 0 && array[temp - 1] > value
      array[temp] = array[temp - 1]
      temp = temp -1
    end
    array[temp] = value
  end

  return array
end
```

For this implimentation we will iterate through the array and create two new varialbes, one to hold the value that we want to insert correctly, and temp, the location that will determine where the value will eventually live.
First we check that there is a sorted half by ensuring i is greather than 0. 

We then will check that the value of the index to the left of the current index we are on is greater than the value of our current index. With this information we know that we need to move the current value to the left and the marger value needs to move to the right.
This will continue until the entire array is sorted.

#### Runtime
Like Bubble Sort, Insertion Sort has a similar average runtime of O(n ^ 2) and space complexity of O(1). 

### Selection Sort
Selection Sort will always look for the minimum element and add it to the front of an auxillary array. but in Ruby we can get away with manipulating the original array.

We will assume that the first element of the array is the minimum, and compare each subsequent element to this value, and will set a new `min_index` element when an array element is less than the value of the element at `min_index`.

```ruby
  def selection_sort(array)
    return array if array.length <= 1
    n = array.length - 1
    n.times do |i|
      min_index = i
      ((i + 1)...n).times do |j|
        min_index = j if array[j] < array[min_index]
      end
        array[i], array[min_index] = array[min_index], array[i] if min_index != i
    end
    array
  end
```
Here are the steps of this sort:
1. set `n` to `array.length - 1`: This is the amount of times we will iterate over the array.
2. Set a `min_index` value to the initial `i` index.
3. Create a second loop starting at the second element until `n`.
4. Compare the value of the element at index `j` with the value of `array[min_index]`; index `j` will become the new `min_index` if the condition is met.
5. If the value of `min_index` is not equal to `i`, then swap `array[i]` with `array[min_index]`

### Analysis
Selection sort will run in O(n ^ 2) regardless if the array is sorted or not. We can improve on this, which we will see in the next algorithm.

### Merge Sort
From what I have seen, this is the most popular divide-and-conquer algorithm. Merge sort makes intuitive sense, but the code is a little less than intuitive. 

A good analogy for merge sort is to imagine searching through a phonebook for someone named "Smith". We then will open the book in the middle and land on the "M" section. As we know, "S" comes after "M", so we can ignore everything in the first half of the book.
Next we open the book from the midpoint between "M" and the last page. Lets say we land on "R", and as we know "S" is after "R", so we can ignore all sections from "M" to "R", and continue so on and so forth.

The goal of merge sort is to take a big chunk of work, and divide it into smaller chunks until we are done.
The merge sort function is generally recursive, so if you are unfamiliar with recursion, please check out [this](https://www.youtube.com/watch?v=YZcO_jRhvxs)

```ruby
def merge_sort(array)
  return array if array.length <= 1

  mid = (array.length / 2).floor
  left = merge_sort(array[0..mid - 1])
  right = merge_sort(array[mid..array.length])
  merge(left, right)
end

def merge(left_array, right_array)
  sorted_array = []
  while !left_array.empty? && !right_array.empty? do
    if left_array[0] < right_array[0] 
      sorted_array.push(left_array.shift)
    else
      sorted_array.push(right_array.shift)
    end
  end

  return sorted_array.concat(left_array).concat(right_array)
end
```
I dont have a good enough grasp of the english language to describe exactly what is going on here, so here is a diagram explaining it.


```markdown
  Recursion tree of `merge_sort` where we define our left and right variables. `merge_sort` will return once there is one element left in the array. 
  
                 [3,2,1,0]
                     |
                    / \
                  /    \
                [3,2]  [1,0]
                  |      |        
                 / \    / \
              [3]  [2] [1] [0]

  Breakdown of `merge`:
  Left Side first pass:
    - left_array = [3]
    - right_array = [2]
    - sorted_array = [2,3]
  Right side first pass:
    - left_array = [1]
    - right_array = [0]
    - sorted_array = [0,1]

 We then return back to `merge_sort` and pass our left_side which is sorted and merged and our right side which is sorted and merged to the `merge` method.  
  Second pass
    - left_array = [2,3]
    - right_array = [0,1]
    - sorted_array = [0,1,2,3]

We then bubble up our recursive tree to the caller and return [0,1,2,3]
```
 
#### Analysis
The intesting thing about merge sort is that it will always run in O(n log(n)) time and O(n) space. We create a stack frame for each element of the array. Unless we implement a sorting algorithm based on a property of each element such as radix sort, we will not be able to beat O(n log(n)).

### QuickSort
The quick sort algorithm randomly picks a pivot point, and sorts the elemts around it based on whether or not an element is greater than or less than a pivot.After the first pass when every value less than the pivot is on the left hand side and every value greater than the pivot is on the right hand side. we break into two subarrays and apply quicksort to each half.

```ruby
def quick_sort(array)
  return array if array.length <= 1
  pivot = array.delete_at(rand(array.length))

  left = Array.new
  right = Array.new
  array.each do |x|
    if x <= pivot
      left << x
    else
      right << x
    end
  end

  return *quick_sort(left), pivot, *quick_sort(right)
end
```

First we check to see if `array.length <= 1`. We then will pick a random pivot point, and encapsulate that value in `pivot`. 
We then will create a left and right subarray and then loop through every element in the array and compare it to the pivot. If the value is less than the pivot, add that element to the left subarray. If the value is greater than the pivot, add the element to the right subarray.

Note: The `*` (Splat) operator will wrap the return value in an array. Check out [this](https://repl.it/talk/share/Ruby-quick-sort/60088) repl to play around and see.

#### Analysis
QuickSort and merge sort are each dive and conquer algorithms, but interestingly have different run time complexities. QuickSort's average and best case complexity is O(n log(n)) while it's worst case is O(n ^ 2). While it may be slower in the worst case and the same in best and average case, QuickSort in practice can actually be faster.

According to [Geeks for Geeks](https://www.geeksforgeeks.org/quick-sort/). "lthough the worst case time complexity of QuickSort is O(n2) which is more than many other sorting algorithms like Merge Sort and Heap Sort, QuickSort is faster in practice, because its inner loop can be efficiently implemented on most architectures, and in most real-world data. QuickSort can be implemented in different ways by changing the choice of pivot, so that the worst case rarely occurs for a given type of data. However, merge sort is generally considered better when data is huge and stored in external storage."

### Heap Sort
The last algorithm we will go through is Heap Sort. This sorting relies on a specific tree data structure-- the heap, and to be more specific, a max heap. A tree has a root node, and many children, great-grand children, etc.. A heap is a tree that satisfies the heap property. If node P is a parent of node C, then the value of node P is greater than that of node C. A max heap is a specific type of heap where the value of the parent is greater than the value of child nodes. A max heap also must be a complete tree, meaining nodes are filled in from left to right.

Unlike Python, Ruby does not have a heap data structure built in, so we have to do some extra work.

```ruby
def heap_sort(array)
  n = array.length - 1
  a = array
  
  (n / 2).downto(0) do |i|      
    create_max_heap(a, i, n) 
  end

  while n > 0
    a[0], a[n] = a[n], a[0]
    n -= 1
    create_max_heap(a, 0, n)
  end
  a
end

def create_max_heap(array, parent, limit)
  root = array[parent]
  while (child = 2 * parent) <= limit do
    child += 1 if child < limit && array[child] < array[child + 1]
    break if root >= array[child]
    array[parent], parent = array[child], child
  end
  array[parent] = root
end
```

#### Analysis
Heap sort has the same runtime as the other optimal algorithms of O(n log(n)) time, but is done in constant O(1) space, so if space is a concern, this is the algorithm for you.

### Conclusion
While we may not be implimenting these algorithms in a typical real-world setting, it is important to have an idea of run time complexity, and what might be happening under the hood when you call `.sort`. Next I'll be covering something vaguely similar, searching!

