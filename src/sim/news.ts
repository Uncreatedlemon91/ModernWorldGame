import type { GameState, NewsCategory } from './types';

export function addNews(state: GameState, cat: NewsCategory, text: string, countries: string[], region?: number, important = false) {
  state.nextId++;
  state.news.push({ id: `n${state.nextId.toString(36)}`, tick: state.tick, cat, text, countries, region, important });
  if (state.news.length > 250) state.news.splice(0, state.news.length - 250);
}
