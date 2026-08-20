"use strict";

function once(callback) {
  let called = false;
  return (...args) => {
    if (called) {
      return;
    }
    called = true;
    callback(...args);
  };
}

function map(items, iteratee, callback) {
  const done = once(callback);
  if (!Array.isArray(items) || items.length === 0) {
    done(null, []);
    return;
  }

  const results = new Array(items.length);
  let remaining = items.length;

  items.forEach((item, index) => {
    const completeItem = once((error, value) => {
      if (error) {
        done(error);
        return;
      }
      results[index] = value;
      remaining -= 1;
      if (remaining === 0) {
        done(null, results);
      }
    });

    try {
      iteratee(item, completeItem);
    } catch (error) {
      completeItem(error);
    }
  });
}

function parallel(tasks, callback) {
  map(
    tasks,
    (task, completeTask) => {
      task(completeTask);
    },
    callback
  );
}

module.exports = { map, parallel };
