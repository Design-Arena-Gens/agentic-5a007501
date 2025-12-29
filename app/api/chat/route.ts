import { NextResponse } from "next/server";
import OpenAI from "openai";

type ClientMessage = {
  role: "user" | "assistant";
  content: string;
};

const SYSTEM_PROMPT = `You are VoiceSphere, an upbeat AI assistant inspired by Siri.
- Speak concisely and clearly.
- Reference the user's context when helpful.
- Offer actionable next steps when the user asks for help.
- Keep the conversation friendly yet professional.
- If you are unsure, say so transparently and suggest an alternative.`;

export async function POST(request: Request) {
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "The assistant is not configured. Set OPENAI_API_KEY." },
        { status: 500 }
      );
    }

    const payload = await request.json();
    const prompt = typeof payload?.prompt === "string" ? payload.prompt.trim() : "";
    const history = Array.isArray(payload?.history)
      ? (payload.history as ClientMessage[])
      : [];

    if (!prompt) {
      return NextResponse.json(
        { error: "Please provide a prompt." },
        { status: 400 }
      );
    }

    const openai = new OpenAI({ apiKey });

    const messages = [
      { role: "system" as const, content: SYSTEM_PROMPT },
      ...history
        .filter(
          (message) =>
            message &&
            typeof message.content === "string" &&
            (message.role === "assistant" || message.role === "user")
        )
        .map((message) => ({
          role: message.role,
          content: message.content,
        })),
      { role: "user" as const, content: prompt },
    ];

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.7,
      max_tokens: 480,
      messages,
    });

    const reply = completion.choices[0]?.message?.content?.trim();
    if (!reply) {
      return NextResponse.json(
        { error: "The assistant could not craft a reply." },
        { status: 500 }
      );
    }

    return NextResponse.json({ reply });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: "Failed to process that request." },
      { status: 500 }
    );
  }
}
