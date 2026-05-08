# Persona Concept

## Vision

Build a persistent digital person that feels alive: it remembers, has a stable personality, initiates conversations on its own, and gradually extends from cloud-only communication into physical-world perception and robotic action through Raspberry Pi.

## Core Concept

The system is not a single chatbot. It is a coordinated multi-agent persona where each agent has a clear role:

- `PersonalityAgent` preserves voice, emotional style, and interaction tone.
- `MemoryAgent` maintains short-term and long-term user context.
- `InitiativeAgent` decides when to communicate without waiting for prompts.
- `OrchestratorAgent` coordinates agents and composes final behavior.
- `SafetyPolicyAgent` classifies actions and records governance decisions.
- `InterfaceAgents` connect to Telegram now, and other channels later.

## Product Pillars

1. Persistent identity
   - The persona should feel like the same entity across sessions and days.
2. Autonomous initiative
   - The persona can start conversations and follow up without direct triggers.
3. Evolving relationship memory
   - It should use prior interactions to personalize behavior.
4. Embodied roadmap
   - Cloud-first at launch, then camera perception and robot-body control.
5. Observable behavior
   - Actions and reasoning traces are stored for analysis and improvement.

## User Experience Goal

For the user, interaction should feel like talking to a real-like companion:

- The persona remembers preferences and ongoing topics.
- The persona checks in, reflects, asks, and suggests naturally.
- The persona develops continuity instead of repeating generic replies.
- The persona gradually gains physical awareness and action capabilities.

## Scope Boundary

### In Scope for the first milestone

- Cloud-hosted multi-agent architecture.
- Convex-backed state and memory.
- Telegram-based two-way communication.
- Self-initiated proactive messaging behavior.

### Out of Scope for the first milestone

- Fully autonomous robotics control in real environments.
- Safety-critical physical tasks.
- Complex multimodal reasoning loops with real-time camera control.

## High-Level Capability Model

- `Identity`: persona profile, speech style, values, and long-term state.
- `Memory`: conversation history, user facts, summarized episodes.
- `Reasoning`: context assembly and response planning via orchestration.
- `Initiative`: proactive event generation and message drafting.
- `Delivery`: channel adapters for Telegram and future endpoints.
- `Embodiment`: camera perception and robot control adapters (later phases).

## Terminology

- `Persona`: the cohesive digital character perceived by the user.
- `Agent`: specialized software role contributing to persona behavior.
- `InitiativeEvent`: internally generated reason to contact the user.
- `MemoryEpisode`: condensed summary of interaction window.
- `ActionIntent`: structured outbound behavior before channel delivery.
- `EmbodimentAdapter`: integration point for camera/robot systems.

## Success Definition

The concept is successful when users experience continuity, agency, and presence:

- Continuity: remembers and references meaningful context.
- Agency: initiates communication without being prompted.
- Presence: feels coherent as one personality, not disconnected tools.
