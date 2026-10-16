import Link from 'next/link';
import JsonLd from '../../components/JsonLd';
import Legal from '../../components/Legal';
import { articleLd, pageMeta } from '../../lib/seo';

const path = '/active-recall';
const title = 'What is active recall? A practical guide to studying that sticks';
const description = 'Active recall means testing yourself instead of rereading. Learn why retrieval practice and spaced repetition work, how to do them step by step, and how RecallMap automates both from your own notes.';
export const metadata = pageMeta(path, 'What is active recall? A study guide', 'Active recall means testing yourself instead of rereading. Learn why it works, how to practise it, and how RecallMap automates it.');

export default function ActiveRecall() {
  return (
    <>
      <JsonLd data={articleLd(path, title, description)} />
      <Legal eyebrow="Guide" title="What is active recall?" showUpdated={false} showContact={false}
        intro="Active recall is the habit of pulling an answer out of your memory instead of looking it up or rereading it. It feels harder than reviewing notes, and that effort is exactly why it works.">
        <section>
          <h2>Active recall vs. passive review</h2>
          <p>Passive review means rereading, highlighting or watching a lecture again. It feels productive because the material looks familiar, but familiarity is not the same as being able to retrieve something on your own.</p>
          <p>Active recall means closing the book and asking yourself a question: what is the function of chlorophyll, why does this algorithm run in that time, what were the causes of this event. You attempt an answer first, then check it. The attempt, even a wrong one, strengthens memory.</p>
        </section>

        <section>
          <h2>Why it works</h2>
          <ul>
            <li><strong>The testing effect.</strong> Research on retrieval practice, including the well-known study by Roediger and Karpicke (2006), found that people who practised recalling material remembered more a week later than people who spent the same time rereading it.</li>
            <li><strong>The spacing effect.</strong> Memory lasts longer when reviews are spread out over time instead of crammed. The pattern was first described by Hermann Ebbinghaus in the 1880s in his work on the forgetting curve.</li>
            <li><strong>Honest feedback.</strong> Trying to answer shows you what you don’t actually know, while it is still cheap to fix.</li>
          </ul>
        </section>

        <section>
          <h2>How to practise active recall</h2>
          <ol style={{ margin: '10px 0 0', paddingLeft: 22, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <li>Turn what you’re learning into questions, not summaries. One idea per question.</li>
            <li>Answer each question from memory, in your own words, before you look at the source. Typing or writing it out keeps you honest.</li>
            <li>Check the real answer and rate how it went: missed it, barely, fine, or easy.</li>
            <li>Bring missed questions back soon and easy ones back later. This is spaced repetition.</li>
            <li>Test yourself on the whole topic now and then with a quiz, not only on individual cards.</li>
          </ol>
        </section>

        <section>
          <h2>Common mistakes</h2>
          <ul>
            <li>Flipping the card without really attempting an answer first.</li>
            <li>Making cards so long that each one tests five things at once.</li>
            <li>Reviewing everything every day instead of letting the schedule decide.</li>
            <li>Counting “I recognised it” as “I knew it”.</li>
          </ul>
        </section>

        <section>
          <h2>Spaced repetition in plain language</h2>
          <p>Spaced repetition schedules each question for the moment you are about to forget it. If you answer easily, the next review waits longer. If you struggle, it returns sooner. Over time your reviews shrink to the small set of things that still need work. Software does the scheduling so you don’t have to track dates.</p>
        </section>

        <section>
          <h2>How RecallMap does this for you</h2>
          <p>RecallMap generates the questions from your own notes and documents, lets you review them, then runs the answer-first practice and the spaced-repetition schedule for you. Quizzes are graded on the server, and when you have shown mastery honestly you can earn a badge and even publish it as a verifiable credential on the Arc blockchain.</p>
          <div className="cta-row">
            <Link href="/auth?mode=signup" className="btn btn-primary">Try RecallMap free</Link>
            <Link href="/how-it-works" className="btn btn-outline">See how it works</Link>
            <Link href="/arc" className="btn btn-outline">Credentials on Arc</Link>
          </div>
        </section>
      </Legal>
    </>
  );
}
