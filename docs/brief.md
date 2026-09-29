Build an interactive web experience that visualizes my entire Claude usage and accumulated knowledge as an “AI Brain.”

The experience should feel like a combination of:

* A human brain
* Neural networks
* An interactive knowledge graph
* A personal AI memory system
* A futuristic creative portfolio

The goal is to visually represent everything I have researched, designed, built, learned, experimented with, and discussed using Claude as a living neural network.

Core Concept

Create a large interactive AI Brain at the center of the experience.

The brain is composed of multiple layers of interconnected neurons.

Each neuron represents a piece of knowledge, project, conversation, experiment, research topic, design exploration, technical concept, or idea that I have worked on with Claude.

The brain should not feel like a static illustration.

It should feel alive.

Neurons should subtly pulse, connections should animate, and different areas of the brain should become more active depending on the type of knowledge they contain.

⸻

1. Brain Structure

Create a visually sophisticated brain made from:

* Hundreds/thousands of neurons
* Neural connections
* Multiple depth layers
* Clusters of related neurons
* Different neuron sizes based on importance
* Different activity levels based on how frequently I interacted with a topic
* Connections representing relationships between topics

The brain should have a clear sense of depth.

Use several layers:

Layer 01 — Foundation

Basic knowledge and frequently referenced concepts.

Examples:

* UI/UX
* Design
* Product
* Technology
* Research
* Psychology

Layer 02 — Skills

Things I have learned or repeatedly explored.

Examples:

* Design systems
* Interaction design
* UX research
* Prototyping
* AI workflows
* Product strategy
* Motion design

Layer 03 — Projects

Actual things I have created.

Examples:

* Portfolio
* Chrome extensions
* Product concepts
* Websites
* AI experiments
* Design explorations

Layer 04 — Experiments

Things I tried, tested, explored, or partially developed.

Examples:

* New AI workflows
* Automation ideas
* Interaction experiments
* Visual experiments
* Prompt experiments

Layer 05 — Research

Research accumulated from conversations.

Examples:

* Competitor research
* Market research
* Design references
* Product patterns
* User behavior
* Industry trends

Layer 06 — Ideas

Unbuilt ideas and future concepts.

These should feel slightly different visually — more speculative and exploratory.

⸻

2. Neuron Design

Each neuron should represent one meaningful piece of information.

Neuron attributes:

* Title
* Category
* Date created
* Last updated
* Description
* Related conversations
* Related projects
* Skills involved
* What I learned
* What I created
* Key insights
* Related neurons
* Status

Possible statuses:

* Learned
* Exploring
* Built
* Experimenting
* Archived
* In Progress

Neuron size should reflect importance or amount of accumulated information.

For example:

Small neuron:

Micro-interaction research

Medium neuron:

Design system exploration

Large neuron:

Personal AI workflow

⸻

3. Neural Connections

Create connections between related neurons.

For example:

UI Design
↓
Design Systems
↓
Component Architecture
↓
Figma
↓
Design Tooling
↓
AI Design Workflow

Another cluster could be:

AI
↓
Claude
↓
Prompt Engineering
↓
AI Agents
↓
Automation
↓
n8n

Connections should not simply be decorative.

They should represent actual relationships between my knowledge.

When I click a neuron, highlight its connected neurons.

Dim unrelated neurons.

This creates a knowledge exploration experience.

⸻

4. Interaction

The main interaction should be:

Explore → Discover → Dive deeper

When the user hovers over a neuron:

* Increase its brightness
* Show a small tooltip
* Highlight connected neurons
* Show its category
* Show a short description

When the user clicks a neuron:

Open a beautiful Knowledge Detail Panel.

Do NOT navigate to another page.

The brain should remain visible in the background.

The selected neuron becomes the focal point.

⸻

5. Knowledge Detail Panel

The panel should contain:

Neuron Title

Example:

AI-Powered Design Workflow

Category

AI / Design / Workflow

Status

Built

Timeline

Started:
March 2026

Last explored:
September 2026

What I Learned

Show a concise summary of what I learned through Claude conversations.

What I Created

List the things that came out of this knowledge.

For example:

* AI design workflow
* Prompt system
* Figma workflow
* Automation concept

Key Insights

Show 3–5 important insights.

Related Knowledge

Show connected neurons as small interactive nodes.

Example:

Claude → Figma → Design Systems → AI Agents

Conversation History

Show the relevant Claude conversations that contributed to this knowledge.

Each item should contain:

* Conversation title
* Date
* Short summary

⸻

6. Brain Navigation

Add a minimal navigation layer around the brain.

Top area:

MY AI BRAIN

Small subtitle:

A visual map of everything I’ve explored, learned and built with Claude.

Add lightweight controls:

Search

Search across:

* Projects
* Knowledge
* Conversations
* Skills
* Ideas

Filters

* All
* Design
* AI
* Product
* Research
* Development
* Experiments
* Ideas

Time

* All time
* This year
* This month
* Recently explored

⸻

7. Knowledge Metrics

Integrate subtle statistics into the interface.

For example:

1,284
Knowledge nodes

326
Projects & experiments

78
Core skills

2,941
Connections

14
Active areas

Do not make this feel like an analytics dashboard.

The metrics should feel like metadata surrounding the brain.

⸻

8. Visual Language

The visual design should be:

Minimal + futuristic + editorial + experimental.

Avoid generic “AI dashboard” aesthetics.

Do NOT make it look like:

* A SaaS dashboard
* A cryptocurrency interface
* A generic 3D brain
* A sci-fi movie HUD
* A neon cyberpunk interface

Instead, think:

Awwwards website × neural network × digital archive × Apple-like minimalism.

Use:

* Dark background
* Very subtle gradients
* Fine neural connections
* Soft glowing neurons
* Lots of negative space
* Elegant typography
* Subtle depth
* Smooth transitions
* Very restrained color usage

The brain should be the hero.

⸻

9. Motion

Motion is extremely important.

The brain should feel alive even when nothing is happening.

Implement:

Idle state

Neurons slowly pulse.

Connections have extremely subtle movement.

Occasionally a signal travels through a connection.

Hover

The selected neuron expands slightly.

Connected neurons illuminate.

Connections become more visible.

Click

Create a smooth camera transition toward the selected neuron.

The surrounding brain slightly defocuses/dims.

The detail panel appears.

Close

Reverse the transition and return focus to the entire brain.

Search

When searching for something:

Animate the camera toward matching neurons.

Highlight matching clusters.

Dim everything else.

⸻

10. Data Architecture

Do not hard-code the visual representation.

Create a structured data model so that I can continuously add my Claude history.

Use something similar to:

{
  id: "neuron-001",
  title: "AI Design Workflow",
  category: "AI",
  type: "project",
  status: "built",
  createdAt: "2026-03-12",
  updatedAt: "2026-09-20",
  description: "...",
  learned: [
    "...",
    "...",
    "..."
  ],
  created: [
    "...",
    "..."
  ],
  insights: [
    "...",
    "...",
    "..."
  ],
  skills: [
    "AI",
    "UX Design",
    "Prompt Engineering"
  ],
  conversations: [
    {
      title: "...",
      date: "...",
      summary: "..."
    }
  ],
  connections: [
    "neuron-002",
    "neuron-017",
    "neuron-032"
  ]
}

Make the architecture scalable enough to support thousands of neurons.

⸻

11. Claude History Import

The most important part:

Design the system so that my existing Claude data can eventually be imported.

The interface should support a structured dataset containing:

* Conversation history
* Conversation titles
* Dates
* Topics
* Projects
* Prompts
* Key learnings
* Outputs
* Skills
* Ideas

The system should transform this raw information into:

Conversations → Topics → Knowledge → Neurons → Connections

Do not simply visualize every conversation as a neuron.

Instead, intelligently group related conversations into meaningful knowledge clusters.

For example:

50 conversations about Figma should potentially become:

Figma

with connected knowledge such as:

* Auto Layout
* Components
* Design Systems
* Prototyping
* Variables
* AI workflows

⸻

12. AI-Generated Knowledge Layer

Add an optional intelligence layer.

Claude should analyze my historical conversations and identify:

What I repeatedly learn

Topics that appear frequently.

What I repeatedly build

Patterns in my projects.

What I am becoming good at

Skills that appear consistently across conversations.

What I am currently exploring

Recently active topics.

What I abandoned

Ideas/projects that were explored but not continued.

Unexpected connections

Interesting relationships between seemingly unrelated topics.

For example:

“Your exploration of AI agents appears repeatedly connected to your interest in design tooling.”

These insights should become meta-neurons or special connections in the brain.

⸻

13. Zoom Levels

Create multiple zoom levels.

Level 01 — Universe

See the entire brain.

Only major clusters are visible.

Example:

AI / Design / Product / Research / Development

Level 02 — Cluster

Zoom into a category.

Individual neurons become visible.

Level 03 — Knowledge

See individual concepts and their relationships.

Level 04 — Detail

Select a neuron and inspect its complete history.

This should make the experience feel like exploring a universe of my own knowledge.

⸻

14. Search Experience

Make search feel magical.

When I type:

“Figma”

the brain should locate the Figma cluster.

Camera smoothly moves toward it.

Relevant neurons illuminate.

Related knowledge appears.

Then I can explore outward:

Figma → Components → Design Systems → AI → Automation → Claude

The search should feel like finding memories inside a brain, not filtering a database.

⸻

15. Empty / Future State

If there is no data yet, don’t show an empty dashboard.

Instead show a partially formed brain with:

Your brain is still forming.

And:

Start importing your Claude history to visualize everything you’ve explored, learned and built.

After data is imported, the brain gradually forms itself.

⸻

16. Technical Direction

Build this as a highly interactive web experience.

Prefer:

* React
* Three.js / React Three Fiber OR a performant 2D canvas/WebGL approach
* Framer Motion / GSAP for transitions
* Force-directed graph / neural graph visualization
* Smooth camera movement
* GPU-friendly rendering

Performance is critical.

It should remain smooth with:

* 1,000 neurons
* 5,000 neurons
* Potentially 10,000+ connections

Use clustering, level-of-detail rendering, and progressive loading where necessary.

⸻

17. Important Design Principle

The brain should NOT feel like a visualization of data.

It should feel like a visualization of my thinking.

The emotional reaction should be:

“Wow. This is everything I’ve been learning and creating with AI.”

The user should be able to wander through the system and discover unexpected relationships between ideas.

Make it feel personal, intelligent, beautiful and slightly mysterious.

⸻

Final Experience

The landing screen should essentially communicate:

MY AI BRAIN

Everything I’ve explored, learned and built with Claude.

Then the brain slowly comes alive.

Neurons pulse.

Connections form.

Clusters breathe.

I can:

Hover → Discover

Click → Understand

Zoom → Explore

Search → Remember

Follow connections → Discover something unexpected

Build the experience around this idea:

Claude is not just a tool I use. It has become an extension of how I think.

Make the final result feel like a living visual archive of my AI-assisted thinking.