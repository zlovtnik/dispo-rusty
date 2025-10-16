import React from 'react';

/**
 * Example component for testing user interactions
 * Displays a count and provides an increment button
 */
export function ButtonExample() {
  const [count, setCount] = React.useState(0);

  return (
    <div>
      <p>Count: {count}</p>
      <button
        onClick={() => {
          setCount(count + 1);
        }}
      >
        Increment
      </button>
    </div>
  );
}
