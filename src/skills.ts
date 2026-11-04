// Skills: won by solving words, kept three at a time, used whenever you like.

export type Skill = 't' | 'l' | 'w' | 'd' | 'm' | 's'
type Info = { name: string; about: string; weight: number; rarity: 'common' | 'rare' | 'legendary'; icon: string }

// The reel's odds come from `weight`. Icons are 16x16 strokes.
export const SKILLS: Record<Skill, Info> = {
  t: { name: 'Thaw', about: 'Melts all your frozen rows, and any locks waiting for you.', weight: 18, rarity: 'common', icon: 'M8 1.8c2.6 3.3 4.4 5.7 4.4 8a4.4 4.4 0 0 1-8.8 0c0-2.3 1.8-4.7 4.4-8z' },
  l: { name: 'Lantern', about: 'Lights up one letter of your answer, in its right box.', weight: 18, rarity: 'common', icon: 'M6 2.5h4M8 2.5V4M5 4.5h6l-.9 7.5H5.9zM6.2 14h3.6' },
  w: { name: 'Second wind', about: "Your next wrong guess blows away and doesn't use up a row.", weight: 18, rarity: 'common', icon: 'M2 6h8.5a2 2 0 1 0-2-2M2 10h10a2 2 0 1 1-2 2M2 8h5.5' },
  d: { name: 'Decoy', about: 'The next 2 locks aimed at you go to someone random instead.', weight: 16, rarity: 'common', icon: 'M2.5 5.5h7v7h-7zM6.5 3.5V2.5h7v7h-1' },
  m: { name: 'Mirror shield', about: 'The next lock or swap aimed at you bounces back to whoever sent it.', weight: 20, rarity: 'rare', icon: 'M8 1.8l5.2 2.3v3.8c0 3-2.2 5.3-5.2 6.3-3-1-5.2-3.3-5.2-6.3V4.1z' },
  s: { name: 'Swap', about: "Swap boards with someone mid-word: their word, rows and colours become yours, and yours become theirs. Use it, then click their board, or use it again to swap with the leader.", weight: 10, rarity: 'legendary', icon: 'M3 5.5h9.5L10 3M13 10.5H3.5L6 13' },
}
export const CODES = Object.keys(SKILLS) as Skill[]
