// events.js — Lightweight event bus for inter-module communication
const _listeners = {};

const Events = {
  on(event, fn) {
    (_listeners[event] ??= []).push(fn);
    return () => this.off(event, fn);
  },
  off(event, fn) {
    if (!_listeners[event]) return;
    _listeners[event] = _listeners[event].filter(f => f !== fn);
  },
  emit(event, data) {
    (_listeners[event] || []).forEach(fn => fn(data));
  },
};

export default Events;
