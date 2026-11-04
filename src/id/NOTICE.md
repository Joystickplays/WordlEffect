# Indonesian word lists

- `valid.txt`: every five-letter, lower-case word in the Indonesian hunspell dictionary (`id_ID.dic`) from
  [LibreOffice/dictionaries](https://github.com/LibreOffice/dictionaries/tree/master/id), by the hunspell-id authors
  (Ammar Shadiq, Andika Triwidada, Arno Brevoort, Benitius Brevoort, Kurniadi, Viko Adi Rahmawan, Volker Mueller,
  Yurizal Susanto), checked against the lemmas of KBBI. It is used under the GNU Lesser General Public License,
  version 3 ([LICENSE-LGPL-3.0.txt](LICENSE-LGPL-3.0.txt), which builds on the
  [GNU GPL v3](https://www.gnu.org/licenses/gpl-3.0.txt)). The only change is keeping the five-letter words.
- `answers.txt`: the 900 words from `valid.txt` that appear most often in
  [hermitdave/FrequencyWords](https://github.com/hermitdave/FrequencyWords) (`content/2018/id/id_50k.txt`, built from
  OpenSubtitles), minus names, slang spellings and crude words. That ranking is CC-BY-SA 4.0, so this list is shared
  under [CC-BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) too.
