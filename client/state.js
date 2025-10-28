// A simple state manager to make state changes more predictable.

const createState = (initialState) => {
  let state = initialState;
  const listeners = new Set();

  return {
    getState() {
      return state;
    },
    setState(newState) {
      state = { ...state, ...newState };
      listeners.forEach(listener => listener(state));
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener); // Unsubscribe function
    },
  };
};

// Exporting a single store instance
export const store = createState({});