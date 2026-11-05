// How to play: shown on your first visit, and from the ? in the corner. Escape, Enter or a click outside closes it.
import { useState } from 'react'

const still = (e: { preventDefault(): void }) => e.preventDefault() // keep focus off, so keys still reach the board

function Row({ word, marks }: { word: string; marks: string }) {
  const k = { c: 'correct', p: 'present', a: 'absent' } as Record<string, string>
  return (
    <div className="row" aria-hidden="true">
      {[...word].map((ch, i) => (
        <div key={i} className={`tile filled ${k[marks[i]] ?? ''}`}>
          <span>{ch}</span>
        </div>
      ))}
    </div>
  )
}

export function Help({ together, close }: { together: boolean; close: () => void }) {
  const [tab, setTab] = useState(together ? 1 : 0)
  return (
    <div className="help" role="dialog" aria-modal="true" aria-label="How to play" onClick={close}>
      <div className="sheet" onClick={e => e.stopPropagation()}>
        <h2>WordlEffect</h2>
        <p className="tag">It's Wordle, with eye candy. Every letter you find lights up the world, and the music plays along.</p>
        <nav>
          {['alone', 'together'].map((t, i) => (
            <button key={t} className={tab === i ? 'on' : ''} aria-pressed={tab === i} onMouseDown={still} onClick={() => setTab(i)}>
              {t}
            </button>
          ))}
        </nav>
        {tab === 0 ? (
          <div className="page">
            <p>Guess the five-letter word in six tries. Type a word and press <b>Enter</b>. Each letter is checked in turn, on the beat.</p>
            <Row word="light" marks="cpaaa" />
            <ul>
              <li><b className="g">Green</b>: right letter, right place.</li>
              <li><b className="y">Amber</b>: in the word, somewhere else.</li>
              <li><b className="d">Dim</b>: not in the word.</li>
            </ul>
            <p>Every guess that finds a new green adds to your streak. The light grows, and the music swells with it.</p>
            <p>In the bottom-left corner, <b>EN / ID</b> switches between English and Indonesian words, and <b>DAILY / ENDLESS</b> picks one word a day (today's Wordle word) or a new word every time.</p>
          </div>
        ) : (
          <div className="page">
            <p>Up to 8 players, each in their own colour. Everyone plays the same words at their own pace. You see their boards beside yours: colours only, never letters.</p>
            <ul>
              <li><b>Start a room</b> with the two-squares icon in the bottom-left corner. Its name is a word, like <i>amber</i>. Share the link, or have friends type the word on their board and press Enter.</li>
              <li><b>Your name</b>: click it under the board in the room to change it.</li>
              <li><b>The host</b> wears a crown. They've been in the room longest; they pick the settings and start the match.</li>
              <li><b>Modes</b>: <i>last light</i> (fail a word and you're out; the last one lit wins), <i>tide</i> (a timed race for points), <i>stars</i> (first to solve 3 words).</li>
              <li><b>Locks</b>: solve fast, or keep a long streak, and you send locks at whoever is ahead. They freeze one of that player's rows when they next guess.</li>
              <li><b>Versus</b>: everyone for themselves, two teams, or all of you against bots called echoes.</li>
              <li><b>Trials and skills</b> make it stranger. Every setting has an <i>i</i> beside it that explains it.</li>
            </ul>
          </div>
        )}
        <button className="ok" onMouseDown={still} onClick={close}>
          got it
        </button>
      </div>
    </div>
  )
}
