---
layout: home

hero:
  name: "ArchadiAgent"
  text: "High-Performance Agentic AI Engine"
  tagline: "A provider-agnostic TypeScript SDK built from first principles for multi-agent delegation, structured outputs, and observable agent loops."
  actions:
    - theme: brand
      text: Get Started
      link: /01-installation
    - theme: alt
      text: Quick Start
      link: /02-quickstart
    - theme: alt
      text: GitHub Repository
      link: https://github.com/archaditya/archadi-agent-sdk

features:
  - title: Model Provider Agnostic
    details: First-class support for OpenAI, Anthropic Claude, and Google Gemini with built-in exponential backoff, request timeouts, and fallback chains.
  - title: Multi-Agent Orchestration
    details: Seamless inter-agent handoffs with HandoffGuard graph-traversal protection against circular cycles and depth limits.
  - title: Enterprise Safety & Guardrails
    details: Multi-stage pipeline validation covering Input, Tool, and Output stages with human approval gates and LLM moderation.
  - title: Multi-Tier State & Memory
    details: Decoupled session state with File, SQLite WAL, and Mem0 semantic long-term memory adapters.
  - title: Typed Tool Engine
    details: Custom tool definition backed by Zod schemas with automatic JSON-schema generation and runtime input validation.
  - title: Full Observability
    details: Distributed execution tracing with span-level timing, token usage aggregation, and structured event streaming.
---

<style>
:root {
  --vp-c-brand-1: #3b82f6;
  --vp-c-brand-2: #2563eb;
  --vp-c-brand-3: #1d4ed8;
}
</style>
