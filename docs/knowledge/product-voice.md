# Product voice

This governs copy a **user** reads: the landing page, About, empty states, onboarding
guides, marketing sections of the support page, and release notes.

It does not govern documentation. `.e0l/first-principles/documentation.md` owns that, and the
two are deliberately different — docs are for someone who has already decided, product copy is
for someone who has not.

## The voice

Wry. The joke is always at the situation or the incumbent tools, never at the reader, and there
is always something true underneath it.

> Threat modeling for people who hate threat modeling tools.

Threat modeling has a real emotional truth attached: most engineers avoid it, and they avoid it
because the tooling is miserable rather than because the practice is. Copy that acknowledges
that earns the next sentence. Copy that opens with "Everything you need for modern threat
modeling" has to be endured instead.

Rules that make it work:

- **Humour comes from precision and recognition, not from jokes.** "Install something
  Windows-only, drag boxes around for an afternoon, export a report, never open it again" is
  funny because it is specific and the reader has lived it. Puns are not the register.
- **Never punch at the user.** They are not the problem. The tools are.
- **Substance under every joke.** If you delete the wit and nothing informative remains, the
  line is decoration. Cut it.
- **Errors, FAQ answers, and instructions stay plain.** Someone reading an error wants an
  answer, not a bit. Wit at that moment reads as the product enjoying itself while they are
  stuck.
- **Concede real limits.** "It won't find the clever bug in your auth logic. It will find the
  twelve boring ones you were going to skip." A concession is the cheapest credibility
  available and almost no marketing copy will spend it.

## The six tells

These are what machine-generated copy looks like. Every one of them was present on this site
before issue #254, so they are not hypothetical.

1. **Symmetry.** Four feature cards of near-identical length. That shape comes from filling a
   grid, not from having four things worth saying. Real writing is lopsided — one thing matters
   most and gets the most words. Keep the uneven lengths; do not tidy them.
2. **Coverage sentences.** "Build X, run Y, and produce Z — all in a free, cross-platform
   desktop app." A comma series closed by an em-dash summary is the single most recognisable
   generated sentence shape. Break it into sentences of violently different lengths.
3. **No antagonist.** "Everything you need" — compared to what? Naming Microsoft TMT and the
   ~$20K platforms gives the reader somewhere to stand. Vagueness is what you write when you
   are avoiding being wrong.
4. **Nothing conceded.** Text optimised for approval never admits a limit. If every line is a
   strength, the reader discounts all of them.
5. **Stated virtue instead of shown.** "direct, crafted, and grounded", "fills that gap",
   "built with security in mind". Saying you are direct is the least direct available move.
   Replace the claim with the evidence for it.
6. **No one speaking.** Hero → feature grid → code sample → CTA is a template, not an argument.
   A page should build: here is the situation, here is why it persists, here is the third
   option. If the sections can be reordered without loss, there was no argument.

## Checks before shipping copy

- Read it aloud. Anywhere you would not say it to a colleague, rewrite it.
- Delete the best sentence. If the paragraph is unharmed, the paragraph was padding.
- Find the concession. If there is none, you have written a brochure.
- Check every claim is still literally true. Voice work is where overclaims get introduced,
  because confident phrasing is more fun to write — the CTA once said "no data leaves your
  machine", which BYOK provider calls and web analytics both contradict.
- Screenshot the result at 1280px and at mobile width. Headlines that read well in a source
  file orphan words on screen.
