
/**
 * Agent Response Schemas and Prompt Helpers
 *
 * This file centralizes the LLM response structures (JSON schemas) and
 * provides helper functions to generate the corresponding prompt instructions.
 * This ensures that the structured output requirements and the human-readable
 * instructions given to the LLM are always in sync.
 */

export type AgentActionName =
    | 'speak'
    | 'vote'
    | 'proposeTeam'
    | 'executeMission'
    | 'assassinate'
    | 'useExcalibur'
    | 'useLadyOfTheLake'
    | 'updateNote'
    | 'shareGameReflection';

/**
 * Base properties required in almost all agent responses.
 * These are internal thoughts that help the agent reason before acting.
 */
const BASE_PROPERTIES = (langName: string) => ({
    self_check: {
        type: 'string',
        description: `Your persona re-check. (in 2~5 sentences). MUST BE IN: ${langName}`
    },
    reasoning: {
        type: 'string',
        description: `Internal chain-of-thought analysis for the current action. (in 2~5 sentences). MUST BE IN: ${langName}`
    },
    situation_assessment: {
        type: 'string',
        description: `Subjective analysis of other players' behaviors and alignments. (⚠️ STRICTLY PROHIBITED to record game rules, faction counts, or scores here). (in 2~5 sentences). MUST BE IN: ${langName}`
    },
    action_strategy: {
        type: 'string',
        description: `Your planned approach for the next few turns based on your assessment. (in 2~5 sentences). MUST BE IN: ${langName}`
    }
});

const BASE_REQUIRED = ['self_check', 'reasoning', 'situation_assessment', 'action_strategy'];

/**
 * Registry of action-specific schema parts.
 */
const ACTION_SCHEMAS: Record<AgentActionName, (langName: string) => any> = {
    speak: (langName) => ({
        type: 'object',
        properties: {
            ...BASE_PROPERTIES(langName),
            action: {
                type: 'object',
                properties: {
                    speech: {
                        type: 'string',
                        description: `Your public message to other players. MUST BE IN: ${langName}`
                    },
                    pass_hidden_signal: {
                        type: 'object',
                        properties: {
                            target: {
                                type: 'string',
                                description: 'The player ID (or name) you want to pass a secret signal to. Set to "none" if NO signal is sent.'
                            },
                            signal: {
                                type: 'string',
                                enum: ['wink', 'frown', 'none'],
                                description: 'The type of signal to send: "wink", "frown", or "none". Set to "none" if NO signal is sent.'
                            }
                        },
                        required: ['target', 'signal'],
                        description: 'Pass a secret signal to another player. Set target and signal to "none" if you do not want to send a signal.'
                    },
                    readyToVote: {
                        type: 'boolean',
                        description: 'Set to true if you are ready to conclude discussion and proceed to voting.'
                    }
                },
                required: ['speech', 'readyToVote', 'pass_hidden_signal']
            }
        },
        required: [...BASE_REQUIRED, 'action']
    }),

    vote: (langName) => ({
        type: 'object',
        properties: {
            ...BASE_PROPERTIES(langName),
            action: {
                type: 'object',
                properties: {
                    voteChoice: {
                        type: 'boolean',
                        description: 'Your vote on the officially proposed team. true: Approve, false: Reject.'
                    }
                },
                required: ['voteChoice']
            }
        },
        required: [...BASE_REQUIRED, 'action']
    }),

    proposeTeam: (langName) => ({
        type: 'object',
        properties: {
            ...BASE_PROPERTIES(langName),
            action: {
                type: 'object',
                properties: {
                    teamMemberIds: {
                        type: 'array',
                        items: { type: 'string' },
                        description: 'List of player IDs to include in your proposed team.'
                    }
                },
                required: ['teamMemberIds']
            }
        },
        required: [...BASE_REQUIRED, 'action']
    }),

    executeMission: (langName) => ({
        type: 'object',
        properties: {
            ...BASE_PROPERTIES(langName),
            action: {
                type: 'object',
                properties: {
                    playedMissionResult: {
                        type: 'boolean',
                        description: 'Your contribution to the mission. true: Success, false: Fail (Evil only).'
                    }
                },
                required: ['playedMissionResult']
            }
        },
        required: [...BASE_REQUIRED, 'action']
    }),

    assassinate: (langName) => ({
        type: 'object',
        properties: {
            ...BASE_PROPERTIES(langName),
            action: {
                type: 'object',
                properties: {
                    targetId: {
                        type: 'string',
                        description: 'The player ID of the suspected Merlin targeted for assassination.'
                    }
                },
                required: ['targetId']
            }
        },
        required: [...BASE_REQUIRED, 'action']
    }),

    useExcalibur: (langName) => ({
        type: 'object',
        description: 'Excalibur usage decision',
        properties: {
            ...BASE_PROPERTIES(langName),
            targetId: {
                type: 'string',
                nullable: true,
                description: 'The player ID whose mission card to flip, or null to skip using Excalibur.'
            }
        },
        required: [...BASE_REQUIRED, 'targetId']
    }),

    useLadyOfTheLake: (langName) => ({
        type: 'object',
        description: 'Lady of the Lake inspection target',
        properties: {
            ...BASE_PROPERTIES(langName),
            targetId: {
                type: 'string',
                description: 'The player ID of the player you want to inspect for alignment.'
            }
        },
        required: [...BASE_REQUIRED, 'targetId']
    }),

    updateNote: (langName) => ({
        type: 'object',
        description: 'Updated personal note',
        properties: {
            ...BASE_PROPERTIES(langName),
            newNote: {
                type: 'string',
                description: `Your complete updated personal note. This will REPLACE your old note. MUST BE IN: ${langName}`
            }
        },
        required: [...BASE_REQUIRED, 'newNote']
    }),

    shareGameReflection: (langName) => ({
        type: 'object',
        description: 'Post-game reflection',
        properties: {
            ...BASE_PROPERTIES(langName),
            reflection: {
                type: 'string',
                description: `Your public reflection on the game. MUST BE IN: ${langName}`
            }
        },
        required: [...BASE_REQUIRED, 'reflection']
    })
};

/**
 * Get the full JSON schema for a specific action.
 */
export function getAgentResponseSchema(actionName: AgentActionName, langName: string): any {
    return ACTION_SCHEMAS[actionName](langName);
}

/**
 * Generate a prompt string that describes the expected JSON structure.
 * This can be appended to the prompt to guide the LLM.
 */
export function getResponseFormatPrompt(actionName: AgentActionName, langName: string): string {
    const schema = ACTION_SCHEMAS[actionName](langName);
    const properties = schema.properties;

    const fieldDescriptions: string[] = [];
    const example: any = {};

    const processProperties = (props: any, targetExample: any, indent: string = '') => {
        for (const [key, prop] of Object.entries(props)) {
            const p = prop as any;
            if (p.type === 'object' && p.properties) {
                fieldDescriptions.push(`${indent}- **${key}** (object): ${p.description || ''}`);
                targetExample[key] = {};
                processProperties(p.properties, targetExample[key], indent + '  ');
            } else {
                fieldDescriptions.push(`${indent}- **${key}** (${p.type}${p.nullable ? ' | null' : ''}): ${p.description || ''}`);
                targetExample[key] = getExampleValue(key, p.type, p.description || '', p.enum);
            }
        }
    };

    processProperties(properties, example);

    return [
        `### Output Format`,
        `You MUST respond in strict JSON format. No extra text before or after the JSON.`,
        `All generated text fields MUST be in ${langName}.`,
        ``,
        `#### Field Descriptions:`,
        ...fieldDescriptions,
        ``,
        `#### Example Response Structure:`,
        ``,
        JSON.stringify(example, null, 2),
        ``
    ].join('\n');
}

function getExampleValue(key: string, type: string, description: string, enumOptions?: string[]): any {
    if (enumOptions && enumOptions.length > 0) {
        return enumOptions.join(' / ');
    }
    if (type === 'boolean') return "true / false";
    if (type === 'array') return ["id1", "id2", "..."];
    if (key === 'target') return "player_id / none";
    if (key === 'signal') return "wink / frown / none";
    if (key === 'targetId') return "player_id";
    if (key === 'newNote') return "Summarize and merge new info into old note...";
    if (description.includes('Player ID')) return "player_id";
    return "...";
}
