# Project Purpose: Agent Blueprint

## 1. Vision

Build a lightweight, local-first visual workspace where a human and an AI coding agent can understand and modify the same system through a structured graph.

The experience should feel similar to Unreal Engine Blueprint: users create nodes and connect them visually, while the agent reads and edits the graph as structured data—not by interpreting screenshots.

The graph is a shared language between the human and the agent.

## 2. Core Problem

Prompt-driven agent workflows are tiring because project context, architecture, constraints, and intended changes often have to be explained repeatedly. Screenshots are also an inefficient source of truth: they are ambiguous, difficult to edit precisely, and may consume more tokens than structured data.

This project aims to make communication visual, persistent, precise, and token-efficient.

## 3. Core Interaction

1. The user creates or edits a graph on the canvas.
2. Every node and edge has a stable ID and structured data.
3. The agent reads the graph data, not a screenshot.
4. The user asks for a change in natural language.
5. The agent proposes or applies a small, targeted graph patch.
6. The canvas updates from the same graph data.
7. The user can inspect, accept, reject, or undo the change.

Example request:

"Add a Campaign node between DataPool and Catalog. Product and price data comes from ERP, but campaign rules are managed centrally."

The agent should update the relevant nodes and edges without regenerating the whole graph.

## 4. Source of Truth

The structured graph model is the source of truth. The canvas is its visual representation.

Do not maintain separate, unsynchronised visual and semantic models.

A graph contains:
- `nodes`: stable ID, node type, label, position, and semantic data.
- `edges`: stable ID, source node, target node, and optional connection metadata.
- `metadata`: graph ID, schema version, title, and optional project references.

Keep presentation data (such as position, color, and viewport) distinct from semantic data (such as purpose, rules, inputs, outputs, and references).

Use a versioned JSON schema. Validate all agent-proposed changes before applying them.

## 5. Token-Efficiency Principles

- Never send a screenshot when structured graph data is available.
- Do not send the entire graph for every request by default.
- Select the relevant node, its connected nodes, necessary metadata, and required project context.
- Let the agent request more context when needed.
- Prefer small, explicit patches over full graph rewrites.
- Store durable project facts and decisions outside the chat transcript.
- Avoid duplicating information already represented in graph data.
- Measure token usage where possible; do not assume every graph-based approach is automatically cheaper.

## 6. Role of React Flow

Use React Flow (`@xyflow/react`) as the interactive canvas and node-editor library.

React Flow provides the visual interaction layer: node placement, connections, selection, pan, zoom, and custom node rendering. The application must implement the semantic schema, persistence, agent integration, validation, patching, history, and project-specific behavior.

Do not assume React Flow itself is an AI agent, a database, or a workflow execution engine.

Prefer free, open-source components and avoid mandatory paid services or vendor lock-in. React Flow's core library is MIT-licensed.

## 7. Initial Scope (MVP)

Build the smallest working prototype that proves the shared graph model:

1. Display an editable React Flow canvas.
2. Add, rename, move, connect, and delete nodes.
3. Save and load the graph as JSON locally.
4. Give nodes stable IDs and a small, explicit semantic schema.
5. Provide an agent-facing interface for reading the graph.
6. Allow the agent to return validated operations such as:
   - add node
   - update node data
   - connect nodes
   - disconnect edges
   - delete node or edge
   - move node
7. Apply operations to the graph and immediately update the canvas.
8. Show a readable change preview and support undo/revert.

For the first version, agent changes should be reviewable before they are applied. Do not build a complex multi-agent runtime or general workflow executor yet.

## 8. Important Design Principles

- Human-editable: users should be able to draw and rearrange the graph directly.
- Agent-readable: meaning must be available in structured fields, not only labels or colors.
- Agent-writable: changes must be expressible as small validated operations.
- Incremental: preserve unrelated nodes, edges, positions, and user work.
- Transparent: show what the agent plans to change and what it actually changed.
- Reversible: support undo and versioned snapshots.
- Local-first: keep graph files and core functionality local unless the user explicitly configures an external service.
- Technology-neutral semantics: keep the graph schema independent from React Flow-specific rendering details where practical.

## 9. Out of Scope for the First Version

- Replacing the user's coding agent.
- Automatically executing arbitrary code from every node.
- Building a full UML suite.
- Reconstructing semantics from screenshots.
- Requiring a paid cloud platform.
- Sending the complete project or complete graph to the model on every interaction.

## 10. Success Criteria

The MVP is successful when a user can draw a small system diagram, ask the agent to change it in natural language, review the proposed structured changes, apply them, and see the canvas update correctly—without sending a screenshot or repeatedly explaining the entire diagram.

The key product principle is:

**One graph, two collaborators: the human edits it visually; the agent reads and edits its structured data.**
