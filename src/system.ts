'use strict';

export type Mutable<T> = { -readonly [P in keyof T]-?: T[P] };
export type PickMutable<T, K extends keyof T> = Omit<T, K> & { -readonly [P in K]: T[P] };

export * from './system/array';
export * from './system/date';
export * from './system/decorators/gate';
export * from './system/decorators/log';
export * from './system/decorators/memoize';
export * from './system/function';
export * from './system/iterable';
export * from './system/object';
export * from './system/promise';
export * from './system/searchTree';
export * from './system/string';
export * from './system/version';
