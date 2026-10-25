import { useState } from "preact/hooks";

// Android's IntroActivity slides (strings, images and colors from uhabits-android).
const SLIDES = [
  { title: "Welcome", text: "Loop Habit Tracker helps you create and maintain good habits.", image: "intro/intro_icon_1.png", color: "#194673" },
  { title: "Create some new habits", text: "Every day, after performing your habit, put a checkmark on the app.", image: "intro/intro_icon_2.png", color: "#ffa726" },
  { title: "Track your progress", text: "Detailed graphs show you how your habits improved over time.", image: "intro/intro_icon_4.png", color: "#9575cd" },
];

export function Intro({ onDone }: { onDone: () => void }) {
  const [index, setIndex] = useState(0);
  const slide = SLIDES[index];
  const last = index === SLIDES.length - 1;
  return (
    <div class="intro" style={{ background: slide.color }}>
      <div class="intro-body">
        <h1>{slide.title}</h1>
        <img src={slide.image} alt="" />
        <p>{slide.text}</p>
      </div>
      <div class="intro-footer">
        <button onClick={onDone}>{last ? "" : "Skip"}</button>
        <div class="intro-dots">
          {SLIDES.map((_, i) => <span class={i === index ? "active" : ""} />)}
        </div>
        <button class="bold" onClick={() => (last ? onDone() : setIndex(index + 1))}>{last ? "Done" : "Next"}</button>
      </div>
    </div>
  );
}
