import { defineConfig } from 'vitepress'

export default defineConfig({
  title: 'ArchadiAgent SDK',
  description: 'Provider-agnostic AI Agent SDK built from scratch in TypeScript',
  ignoreDeadLinks: true,
  themeConfig: {
    nav: [
      { text: 'Home', link: '/' },
      { text: 'Docs', link: '/01-installation' },
      { text: 'GitHub', link: 'https://github.com/archaditya/archadi-agent-sdk' }
    ],
    sidebar: [
      {
        text: 'Getting Started',
        items: [
          { text: 'Installation', link: '/01-installation' },
          { text: 'Quick Start', link: '/02-quickstart' },
        ]
      },
      {
        text: 'Core Architecture',
        items: [
          { text: 'Tools', link: '/03-tools' },
          { text: 'Handoffs (Multi-Agent)', link: '/04-handoffs' },
          { text: 'Guardrails', link: '/05-guardrails' },
          { text: 'Memory & Sessions', link: '/06-memory-and-sessions' },
          { text: 'Structured Output', link: '/07-structured-output' },
          { text: 'Streaming & Tracing', link: '/08-streaming-and-tracing' },
          { text: 'Providers & Fallback', link: '/09-providers-and-fallback' },
          { text: 'Error Handling', link: '/10-error-handling' },
          { text: 'CLI Reference', link: '/11-cli' },
        ]
      }
    ],
    socialLinks: [
      { icon: 'github', link: 'https://github.com/archaditya/archadi-agent-sdk' }
    ]
  }
})
