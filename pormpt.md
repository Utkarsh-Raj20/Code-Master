### Architecture & Implementation Guide: Advanced Prompt Rewriting

This document outlines the technical architecture and step-by-step implementation for building a custom AI agent CLI featuring advanced prompt-rewriting, lifecycle hooks, and contextual injection. 

### 1. Core Architecture Layer

An advanced CLI agent processes raw text through an execution pipeline rather than feeding user input directly to the primary LLM model. This pipeline intercepts the input, restructures it for optimal structural tracking, prunes conversational noise, and merges relevant context. 

[User Input] ──> [Hooks & Interceptors] ──> [Rewriter / Planner LLM] ──> [Context / File Injection] ──> [Main Core Agent LLM]

### 2. Technical Implementation

### Step 1: Hook and Interceptor Engine

This component establishes an event-driven system inside your CLI framework. Before any query is processed, the engine looks for local script overrides inside the project directory (e.g., .config/hooks/userPromptSubmit.js), allowing users to write custom interceptors. 

javascript

// cli-engine/prompt-pipeline.js
import fs from 'fs';
import path from 'path';

export async function processPrompt(rawInput, projectRoot) {
  let processedPrompt = rawInput;

  // Locate local project execution hooks
  const hookPath = path.join(projectRoot, '.config/hooks/userPromptSubmit.js');
  
  if (fs.existsSync(hookPath)) {
    try {
      // Dynamic import of the developer's custom hook script
      const { default: customHook } = await import(path.toNamespacedPath(hookPath));
      if (typeof customHook === 'function') {
        processedPrompt = await customHook(processedPrompt);
      }
    } catch (error) {
      console.error(`[Warning] Failed to run userPromptSubmit hook: ${error.message}`);
    }
  }

  return processedPrompt;
}

Use code with caution.

### Step 2: The Rewriter LLM Engine (Meta-Prompting)

To transform simple developer instructions (e.g., *"fix the broken routing errors"*) into clear structural declarations, pass the text through a fast model running a meta-prompting utility. This strips out conversational fluff and groups the request into target schemas. 

javascript

// cli-engine/rewriter.js
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic();

const REWRITER_SYSTEM_PROMPT = `
You are an expert prompt optimization engine for a software engineering AI agent CLI.
Your job is to rewrite the user's raw input into a highly structured, high-signal, XML-tagged instruction sheet optimized for Claude.

Rules:
1. Strip all conversational filler ("please", "can you help me").
2. Isolate the explicit goal, task type (Build, Debug, Review, Refactor), and implied constraints.
3. Structure the output using XML tags: <task_type>, <objective>, and <execution_guardrails>.
4. Do not talk to the user. Only return the optimized string.
`;

export async function optimizePromptWithLLM(userInput) {
  const response = await anthropic.messages.create({
    model: "claude-3-5-haiku-latest", 
    max_tokens: 1000,
    system: REWRITER_SYSTEM_PROMPT,
    messages: [{ role: "user", content: `Rewrite this developer prompt: "${userInput}"` }]
  });

  return response.content.text;
}

Use code with caution.

### Step 3: Core Repository Context Injection

Maintain codebase alignment by scanning for project guidelines pinned inside the root directory (e.g., CLAUDE.md or AGENT.md). This text block is embedded into the system message wrapper. 

javascript

// cli-engine/context-manager.js
import fs from 'fs';
import path from 'path';

export function injectProjectContext(projectRoot) {
  const contextFile = path.join(projectRoot, 'CLAUDE.md');
  
  if (fs.existsSync(contextFile)) {
    const projectRules = fs.readFileSync(contextFile, 'utf-8');
    return `
<project_architecture_and_guidelines>
${projectRules}
</project_architecture_and_guidelines>
`;
  }
  
  return '';
}

Use code with caution.

### Step 4: Final Orchestration Engine

Combine each layout stage inside the primary application command run-block before passing the unified payload array down to the core agent instance. 

javascript

// cli-engine/main.js
import { processPrompt } from './prompt-pipeline.js';
import { optimizePromptWithLLM } from './rewriter.js';
import { injectProjectContext } from './context-manager.js';
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic();

async function handleUserCommand(rawUserInput, projectRoot) {
  // 1. Pass through developer script intercepts
  let finalPrompt = await processPrompt(rawUserInput, projectRoot);

  // 2. Perform advanced LLM-backed restructuring/rewriting
  finalPrompt = await optimizePromptWithLLM(finalPrompt);

  // 3. Gather project baseline markdown configurations
  const structuralContext = injectProjectContext(projectRoot);

  // 4. Combine structural context with rewritten prompt for the primary agent loop
  const systemPrompt = `You are a core coding assistant agent.\n${structuralContext}`;

  console.log("Sending optimized instruction payload to main agent...");

  const stream = await anthropic.messages.create({
    model: "claude-3-5-sonnet-latest",
    max_tokens: 4000,
    system: systemPrompt,
    messages: [{ role: "user", content: finalPrompt }],
    stream: true
  });

  for await (const chunk of stream) {
    if (chunk.type === 'content_block_delta') {
      process.stdout.write(chunk.delta.text);
    }
  }
}

Use code with caution.

### 3. Best Practices & Optimization Techniques

* **Context Compaction:** When managing multi-turn agent text sessions, implement automated truncation handlers. If context limits are approached, use your fast rewriter to summarize prior execution states into compact <historical_decisions> blocks instead of wiping session logs entirely.
* **Prompt Caching:** Apply Anthropic’s ephemeral prompt caching headers (cache-control: {"type": "ephemeral"}) to the structuralContext data block. Since architecture files like CLAUDE.md stay static throughout a standard session, caching cuts base processing input token costs by up to 90%.