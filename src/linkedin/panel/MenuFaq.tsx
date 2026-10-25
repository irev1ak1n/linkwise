import { useId, useState } from "react";

export const FAQ_ITEMS: { question: string; answer: string }[] = [
  {
    question: "What does LinkWise analyze?",
    answer: "LinkWise can analyze the LinkedIn profile or job listing you are currently viewing and compare it with criteria you provide.",
  },
  {
    question: "How does the match score work?",
    answer: "LinkWise reviews the information available on the page, compares it with your criteria, and uses the strongest evidence it finds to calculate and explain the match.",
  },
  {
    question: "Does LinkWise search for people or jobs for me?",
    answer: "No. LinkWise analyzes profiles and job listings that you open yourself on LinkedIn. It is designed to make evaluating them faster.",
  },
  {
    question: "Can LinkWise help improve my own profile?",
    answer: "Yes. LinkWise can review your profile, identify areas that could be improved, and provide suggestions for sections such as your headline and About section.",
  },
  {
    question: "Why does LinkWise sometimes find more information while I scroll?",
    answer: "LinkedIn loads some information dynamically. LinkWise can continue reading newly loaded content and update the analysis when additional useful information becomes available.",
  },
  {
    question: "Does LinkWise change my LinkedIn profile automatically?",
    answer: "No. LinkWise provides analysis and suggestions, but the user remains in control of any changes made to their LinkedIn profile.",
  },
];

export function MenuFaq() {
  const [open, setOpen] = useState<number | null>(null);
  const baseId = useId();

  return (
    <section className="lw-faq" aria-labelledby={`${baseId}-title`}>
      <div className="lw-faq__heading">
        <h2 className="lw-faq__title" id={`${baseId}-title`}>
          Frequently Asked Questions
        </h2>
      </div>
      <ul className="lw-faq__list">
        {FAQ_ITEMS.map((item, index) => {
          const isOpen = open === index;
          return (
            <li key={item.question} className={`lw-faq__item${isOpen ? " lw-faq__item--open" : ""}`}>
              <button
                type="button"
                className="lw-faq__question"
                id={`${baseId}-q${index}`}
                aria-expanded={isOpen}
                aria-controls={`${baseId}-a${index}`}
                onClick={() => setOpen(isOpen ? null : index)}
              >
                <span>{item.question}</span>
                <span className="lw-faq__chevron" aria-hidden="true">
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M6 9l6 6 6-6" />
                  </svg>
                </span>
              </button>
              <div className="lw-faq__answer" id={`${baseId}-a${index}`} role="region" aria-labelledby={`${baseId}-q${index}`}>
                <div className="lw-faq__answer-inner">
                  <p>{item.answer}</p>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
