---
# https://vitepress.dev/reference/default-theme-home-page
layout: home

hero:
  name: "ArchadiAgent SDK"
  text: "Provider-Agnostic AI Agent Engine"
  tagline: "Build multi-agent LLM systems from scratch with typed tools, safety guardrails, handoffs, and tracing."
  actions:
    - theme: brand
      text: Get Started
      link: /01-installation
    - theme: alt
      text: Quick Start
      link: /02-quickstart
    - theme: alt
      text: View on GitHub
      link: https://github.com/archaditya/archadi-agent-sdk

features:
  - title: 🛠️ Multi-Provider Support
    details: Seamlessly swap between OpenAI, Anthropic (Claude), and Google Gemini with automatic exponential backoff retries and fallback chains.
  - title: 🤝 Multi-Agent Handoffs
    details: Built-in agent delegation with HandoffGuard protection to detect and prevent infinite agent-to-agent loops.
  - title: 🛡️ Safety & Guardrails
    details: Three-layer execution guardrails (Input, Tool, Output) plus human approval gates and LLM-based content moderation.
  - title: 💾 Persistent Memory
    details: Supports InMemory, File, SQLite WAL database, and Mem0 long-term memory integration.
---

# Overview

ArchadiAgent is a lightweight, high-performance TypeScript SDK built by Aditya Kumar Kushwaha for building reliable tool-using agents.
