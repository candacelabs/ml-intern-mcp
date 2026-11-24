// Generated from openapi.yaml by npm run generate.
export interface paths {
    "/mcp": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Send an ML Intern MCP request or notification
         * @description Send Accept: application/json, text/event-stream. The bouquet selects intern. Anonymous access exposes the three tools marked anonymous. HuggingChat also sets the login query marker, which requires a bearer credential at initialization. A signed-in account can discover the other tools. Hub permissions govern individual actions.
         */
        post: operations["postMcpMessage"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
}
export type webhooks = Record<string, never>;
export interface components {
    schemas: {
        CreateRepoInput: {
            /** @description Destination repo URI in the form hf://models|datasets|spaces|buckets/OWNER/NAME. */
            uri: string;
            /** @description Optional source repo URI to duplicate, in the form hf://models|datasets|spaces/OWNER/NAME. Must use the same repo type as uri. */
            source_uri?: string;
            /** @description Visibility for the new repo. For duplication, omit to preserve the source visibility; set true for private or false for public. */
            private?: boolean;
            /**
             * @description Space SDK for new empty Spaces. When duplicating (source_uri set), the Space keeps the source sdk; omit sdk or pass the same value.
             * @enum {string}
             */
            sdk?: "streamlit" | "gradio" | "docker" | "static";
            /** @description Space hardware to start on, for new or duplicated Spaces only (rejected for other repo types). Omit for the free cpu-basic. Examples: cpu-upgrade, zero-a10g, t4-small, t4-medium, l4x1, l4x4, l40sx1, l40sx4, l40sx8, a10g-small, a10g-large, a10g-largex2, a10g-largex4, a100-large, a100x4, a100x8, rtx-pro-6000, rtx-pro-6000x2, rtx-pro-6000x4, rtx-pro-6000x8. Use zero-a10g for ZeroGPU, which needs sdk gradio (the default for new ZeroGPU Spaces) and a PRO account (or a Team/Enterprise plan for an org-owned Space). suggested_hardware in the README does NOT set the hardware; only this parameter does. Paid flavors bill the owner from creation. */
            hardware?: string;
        };
        CreateRepoOutput: {
            /** @enum {string} */
            action: "created" | "duplicated";
            uri: string;
            url: string;
            repo: string;
            /** @enum {string} */
            repo_type: "model" | "dataset" | "space" | "bucket";
            id?: string;
            source_uri?: string;
            source_repo?: string;
            /** @enum {string} */
            sdk?: "streamlit" | "gradio" | "docker" | "static";
            hardware?: {
                requested: string;
                current?: string;
                stage?: string;
                confirmed: boolean;
            };
        };
        CreateRepoCallResult: components["schemas"]["CallToolResult"] & ({
            structuredContent: components["schemas"]["CreateRepoOutput"];
        } | {
            /** @constant */
            isError: true;
        });
        HfFsInput: {
            operations: {
                /**
                 * @description Command to execute.
                 * @enum {string}
                 */
                cmd: "ls" | "cat" | "attach" | "stat" | "find" | "search";
                /** @description Command arguments. First item must be an hf:// URI, not a local path or bare filename. One argument per array item. search discovers resources, not repository contents; use root/owner discovery scopes, find for file discovery, or cat for a known text file. --tag requires hf://models|datasets|spaces[/OWNER]; --kind requires hf://spaces[/OWNER] and its only valid value is mcp. */
                args: string[];
            }[];
        };
        HfFsOutput: {
            results: ({
                index: number;
                /** @constant */
                status: "success";
                result: {
                    uri: string;
                    /** @enum {string} */
                    op: "ls" | "cat" | "attach" | "stat" | "find" | "search";
                    entries?: {
                        /** @enum {string} */
                        type: "file" | "dir" | "repo" | "bucket" | "collection" | "paper" | "link";
                        path: string;
                        uri?: string;
                        name?: string;
                        target_uri?: string;
                        /** @enum {string} */
                        repo_type?: "model" | "dataset" | "space" | "bucket";
                        size?: number;
                        total_files?: number;
                        lfs?: boolean;
                        private?: boolean;
                        gated?: false | ("auto" | "manual");
                        likes?: number;
                        downloads?: number;
                        task?: string;
                        library?: string;
                        tags?: string[];
                        trending_score?: number;
                        sdk?: string;
                        title?: string;
                        category?: string;
                        semantic_relevance?: number;
                        anchor?: string;
                        description?: string;
                        upvotes?: number;
                        created_at?: string;
                        published_at?: string;
                        daily_papers_date?: string;
                        daily_papers_uri?: string;
                        url?: string;
                        arxiv_url?: string;
                        observed_at?: string;
                        updated_at?: string;
                        /** @enum {string} */
                        content_type?: "application/json" | "text/markdown";
                    }[];
                    path?: string;
                    content?: string;
                    /** @enum {string} */
                    content_type?: "application/json" | "text/markdown";
                    /** @enum {string} */
                    mime_type?: "image/jpeg" | "image/png" | "image/webp";
                    section?: string;
                    bytes?: number;
                    exists?: boolean;
                    /** @enum {string} */
                    type?: "namespace" | "repo" | "dir" | "file" | "collection" | "paper" | "link" | "missing";
                    namespace?: string;
                    size?: number;
                    lfs?: boolean;
                    target_uri?: string;
                    published_at?: string;
                    daily_papers_date?: string;
                    daily_papers_uri?: string;
                    url?: string;
                    arxiv_url?: string;
                    truncated?: boolean;
                    /** @enum {string} */
                    truncation_reason?: "entry_limit" | "max_bytes" | "limit" | "provider_limit" | "output_budget";
                    truncation_message?: string;
                    next_offset?: number;
                    warnings?: string[];
                } & unknown;
                output_truncated?: boolean;
            } | {
                index: number;
                /** @constant */
                status: "error";
                error: {
                    /** @enum {string} */
                    code: "HF_FS_INVALID_ARGUMENT" | "HF_FS_NOT_FOUND" | "HF_FS_NOT_A_DIRECTORY" | "HF_FS_NOT_A_FILE" | "HF_FS_UNSUPPORTED_OPERATION" | "HF_FS_ACCESS_DENIED" | "HF_FS_TEXT_ONLY" | "HF_FS_IMAGE_ONLY" | "HF_FS_UNSUPPORTED_MEDIA" | "HF_FS_IMAGE_TOO_LARGE" | "HF_FS_ATTACHMENT_BUDGET_EXCEEDED" | "HF_FS_IMAGE_CONTENT_DISABLED" | "HF_FS_ATTACHMENT_INTEGRITY";
                    message: string;
                    recovery: string;
                    /** @constant */
                    retryable: false;
                    /** @enum {string} */
                    suggestedOperation?: "ls" | "cat" | "attach" | "stat" | "search";
                };
            })[];
            truncated?: boolean;
            /** @constant */
            truncation_reason?: "output_budget";
        };
        HfFsCallResult: components["schemas"]["CallToolResult"] & ({
            structuredContent: components["schemas"]["HfFsOutput"];
        } | {
            /** @constant */
            isError: true;
        });
        HfFsWriteInput: {
            /**
             * @description Command to execute.
             * @enum {string}
             */
            cmd: "put" | "rm";
            /** @description Command arguments; each array item is one grammar token. */
            args: string[];
            /** @description File content for put. UTF-8 text by default; base64 when args includes --base64. */
            content?: string;
        };
        HfFsWriteOutput: {
            uri: string;
            /** @enum {string} */
            op: "put" | "rm";
            repo: string;
            /** @enum {string} */
            repo_type: "model" | "dataset" | "space" | "bucket";
            path: string;
            bytes?: number;
            branch?: string;
            message: string;
            commit?: {
                oid: string;
                url: string;
            };
            pull_request_url?: string;
        };
        HfFsWriteCallResult: components["schemas"]["CallToolResult"] & ({
            structuredContent: components["schemas"]["HfFsWriteOutput"];
        } | {
            /** @constant */
            isError: true;
        });
        HfJobsInput: {
            /**
             * @description Operation to execute. Valid values: "run", "uv", "ps", "logs", "inspect", "cancel", "update-labels", "scheduled update-labels", "scheduled run", "scheduled uv", "scheduled ps", "scheduled inspect", "scheduled delete", "scheduled suspend", "scheduled resume"
             * @enum {string}
             */
            operation?: "run" | "uv" | "ps" | "logs" | "inspect" | "cancel" | "update-labels" | "scheduled update-labels" | "scheduled run" | "scheduled uv" | "scheduled ps" | "scheduled inspect" | "scheduled delete" | "scheduled suspend" | "scheduled resume";
            /** @description Operation-specific arguments as a JSON object */
            args?: {
                [key: string]: unknown;
            };
        };
        HfJobsOutput: {
            /** @enum {string} */
            operation?: "run" | "uv" | "ps" | "logs" | "inspect" | "cancel" | "update-labels" | "scheduled update-labels" | "scheduled run" | "scheduled uv" | "scheduled ps" | "scheduled inspect" | "scheduled delete" | "scheduled suspend" | "scheduled resume";
            outcome: {
                /** @constant */
                kind: "usage";
                available_operations: ("run" | "uv" | "ps" | "logs" | "inspect" | "cancel" | "update-labels" | "scheduled update-labels" | "scheduled run" | "scheduled uv" | "scheduled ps" | "scheduled inspect" | "scheduled delete" | "scheduled suspend" | "scheduled resume")[];
                instructions: string;
            } | {
                /** @constant */
                kind: "help";
                /** @enum {string} */
                operation: "run" | "uv" | "ps" | "logs" | "inspect" | "cancel" | "update-labels" | "scheduled update-labels" | "scheduled run" | "scheduled uv" | "scheduled ps" | "scheduled inspect" | "scheduled delete" | "scheduled suspend" | "scheduled resume";
                /** @enum {string} */
                reason: "requested" | "missing_arguments";
                instructions: string;
            } | {
                /** @constant */
                kind: "job";
                job: {
                    id: string;
                    url?: string;
                    endpoint?: string;
                    created_at: string;
                    finished_at?: string;
                    docker_image?: string;
                    space_id?: string;
                    command?: string[];
                    arguments?: string[];
                    environment_variable_names: string[];
                    secret_names: string[];
                    flavor: string;
                    status: {
                        stage: string;
                        message?: string | null;
                        expose_urls?: string[];
                    };
                    owner: {
                        id: string;
                        name: string;
                        /** @enum {string} */
                        type?: "user" | "org";
                    };
                    created_by?: {
                        id: string;
                        name: string;
                        /** @enum {string} */
                        type?: "user" | "org";
                    };
                    tags?: string[];
                    labels?: {
                        [key: string]: string;
                    };
                    timeout_seconds?: number;
                };
                logs?: string[];
                logs_finished?: boolean;
                logs_truncated?: boolean;
                logs_error?: string;
            } | {
                /** @constant */
                kind: "jobs";
                jobs: {
                    id: string;
                    url?: string;
                    endpoint?: string;
                    created_at: string;
                    finished_at?: string;
                    docker_image?: string;
                    space_id?: string;
                    command?: string[];
                    arguments?: string[];
                    environment_variable_names: string[];
                    secret_names: string[];
                    flavor: string;
                    status: {
                        stage: string;
                        message?: string | null;
                        expose_urls?: string[];
                    };
                    owner: {
                        id: string;
                        name: string;
                        /** @enum {string} */
                        type?: "user" | "org";
                    };
                    created_by?: {
                        id: string;
                        name: string;
                        /** @enum {string} */
                        type?: "user" | "org";
                    };
                    tags?: string[];
                    labels?: {
                        [key: string]: string;
                    };
                    timeout_seconds?: number;
                }[];
                total_jobs: number;
            } | {
                /** @constant */
                kind: "logs";
                job_id: string;
                lines: string[];
                finished: boolean;
                truncated: boolean;
            } | {
                /** @constant */
                kind: "inspections";
                requested_job_ids: string[];
                inspections: ({
                    job_id: string;
                    /** @constant */
                    status: "success";
                    job: {
                        id: string;
                        url?: string;
                        endpoint?: string;
                        created_at: string;
                        finished_at?: string;
                        docker_image?: string;
                        space_id?: string;
                        command?: string[];
                        arguments?: string[];
                        environment_variable_names: string[];
                        secret_names: string[];
                        flavor: string;
                        status: {
                            stage: string;
                            message?: string | null;
                            expose_urls?: string[];
                        };
                        owner: {
                            id: string;
                            name: string;
                            /** @enum {string} */
                            type?: "user" | "org";
                        };
                        created_by?: {
                            id: string;
                            name: string;
                            /** @enum {string} */
                            type?: "user" | "org";
                        };
                        tags?: string[];
                        labels?: {
                            [key: string]: string;
                        };
                        timeout_seconds?: number;
                    };
                } | {
                    job_id: string;
                    /** @constant */
                    status: "error";
                    message: string;
                })[];
            } | {
                /** @constant */
                kind: "scheduled_job";
                scheduled_job: {
                    id: string;
                    schedule: string;
                    suspended: boolean;
                    last_run?: string;
                    next_run?: string;
                    owner: {
                        id: string;
                        name: string;
                        /** @enum {string} */
                        type?: "user" | "org";
                    };
                    created_at: string;
                    job_spec: {
                        docker_image?: string;
                        space_id?: string;
                        /** @description Absent when the image's default command runs. */
                        command?: string[];
                        arguments?: string[];
                        environment_variable_names: string[];
                        secret_names: string[];
                        flavor: string;
                        timeout_seconds?: number;
                        volumes?: {
                            /** @enum {string} */
                            type: "bucket" | "model" | "dataset" | "space";
                            source: string;
                            mount_path: string;
                            revision?: string;
                            read_only?: boolean;
                            path?: string;
                        }[];
                        labels?: {
                            [key: string]: string;
                        };
                        exposed_ports?: number[];
                    };
                };
            } | {
                /** @constant */
                kind: "scheduled_jobs";
                scheduled_jobs: {
                    id: string;
                    schedule: string;
                    suspended: boolean;
                    last_run?: string;
                    next_run?: string;
                    owner: {
                        id: string;
                        name: string;
                        /** @enum {string} */
                        type?: "user" | "org";
                    };
                    created_at: string;
                    job_spec: {
                        docker_image?: string;
                        space_id?: string;
                        /** @description Absent when the image's default command runs. */
                        command?: string[];
                        arguments?: string[];
                        environment_variable_names: string[];
                        secret_names: string[];
                        flavor: string;
                        timeout_seconds?: number;
                        volumes?: {
                            /** @enum {string} */
                            type: "bucket" | "model" | "dataset" | "space";
                            source: string;
                            mount_path: string;
                            revision?: string;
                            read_only?: boolean;
                            path?: string;
                        }[];
                        labels?: {
                            [key: string]: string;
                        };
                        exposed_ports?: number[];
                    };
                }[];
                total_scheduled_jobs: number;
            } | {
                /** @constant */
                kind: "acknowledgement";
                resource_id: string;
                /** @enum {string} */
                action: "canceled" | "deleted" | "suspended" | "resumed";
                message: string;
            } | {
                /** @constant */
                kind: "unavailable";
                message: string;
                upgrade_url?: string;
            } | {
                /** @constant */
                kind: "error";
                /** @enum {string} */
                code: "unknown_operation" | "validation" | "execution";
                message: string;
            };
            total_results: number;
            results_shared: number;
        };
        HfJobsCallResult: components["schemas"]["CallToolResult"] & ({
            structuredContent: components["schemas"]["HfJobsOutput"];
        } | {
            /** @constant */
            isError: true;
        });
        HfSandboxInput: {
            /**
             * @description Command to execute.
             * @enum {string}
             */
            cmd: "create" | "status" | "terminate" | "ps" | "kill";
            /** @description Command arguments; each array item is one grammar token. Sandbox handle returned by hf_sandbox create. Use this value for future sandbox operations. Accepted forms: hfsb2:NAMESPACE:JOB_ID, NAMESPACE/JOB_ID, or a bare job id. */
            args: string[];
        };
        HfSandboxOutput: {
            /** @enum {string} */
            op: "create" | "status" | "terminate" | "ps" | "kill";
            handle?: string;
            name?: string;
            namespace?: string;
            job_id?: string;
            url?: string;
            job_url?: string;
            volumes?: {
                [key: string]: unknown;
            }[];
            message?: string;
            status?: {
                [key: string]: unknown;
            };
            health?: {
                [key: string]: unknown;
            };
            terminated?: boolean;
            processes?: {
                [key: string]: unknown;
            }[];
            process_id?: string;
            killed?: boolean;
        };
        HfSandboxCallResult: components["schemas"]["CallToolResult"] & ({
            structuredContent: components["schemas"]["HfSandboxOutput"];
        } | {
            /** @constant */
            isError: true;
        });
        HfSandboxExecInput: {
            /**
             * @description Command to execute.
             * @enum {string}
             */
            cmd: "exec";
            /** @description Command arguments; each array item is one grammar token. Sandbox handle returned by hf_sandbox create. Use this value for future sandbox operations. Accepted forms: hfsb2:NAMESPACE:JOB_ID, NAMESPACE/JOB_ID, or a bare job id. */
            args: string[];
        };
        HfSandboxExecOutput: {
            returncode?: number | null;
            stdout?: string;
            stderr?: string;
            signal?: number | string | null;
            timed_out?: boolean;
            duration_ms?: number;
            detached?: boolean;
            process_id?: string;
            pid?: number;
            tag?: string;
        };
        HfSandboxExecCallResult: components["schemas"]["CallToolResult"] & ({
            structuredContent: components["schemas"]["HfSandboxExecOutput"];
        } | {
            /** @constant */
            isError: true;
        });
        HfSandboxFsInput: {
            /**
             * @description Command to execute.
             * @enum {string}
             */
            cmd: "ls" | "cat" | "stat" | "write" | "rm" | "mkdir";
            /** @description Command arguments; each array item is one grammar token. Sandbox handle returned by hf_sandbox create. Use this value for future sandbox operations. Accepted forms: hfsb2:NAMESPACE:JOB_ID, NAMESPACE/JOB_ID, or a bare job id. */
            args: string[];
        };
        HfSandboxFsOutput: {
            /** @enum {string} */
            op: "ls" | "cat" | "stat" | "write" | "rm" | "mkdir";
            path: string;
            entries?: {
                [key: string]: unknown;
            }[];
            content?: string;
            bytes?: number;
            size?: number;
            truncated?: boolean;
            next_offset?: number;
            exists?: boolean;
            /** @enum {string} */
            type?: "file" | "dir" | "symlink";
            mtime_ms?: number | null;
            mode?: string;
            deleted?: boolean;
            created?: boolean;
        };
        HfSandboxFsCallResult: components["schemas"]["CallToolResult"] & ({
            structuredContent: components["schemas"]["HfSandboxFsOutput"];
        } | {
            /** @constant */
            isError: true;
        });
        HfWhoamiInput: Record<string, unknown>;
        HfWhoamiOutput: {
            /** @constant */
            status: "authenticated";
            account: {
                id: string;
                /** @enum {string} */
                type: "user" | "org" | "app";
                name: string;
                /** Format: uri */
                url?: string;
                is_pro?: boolean;
            };
            organizations: {
                id: string;
                name: string;
                display_name: string;
                /** Format: uri */
                url: string;
                role?: string;
                plan?: string;
                security_restrictions?: string[];
                resource_groups?: {
                    id: string;
                    name: string;
                    role: string;
                }[];
            }[];
            credential: {
                /** @constant */
                type: "personal_access_token";
                /** @enum {string} */
                role: "read" | "write" | "fine_grained";
                /** Format: date-time */
                created_at?: string;
                permissions?: {
                    scoped: {
                        entity: {
                            id: string;
                            /** @enum {string} */
                            type: "model" | "dataset" | "space" | "bucket" | "kernel" | "collection" | "org" | "user" | "resource_group" | "oauth_app";
                            name?: string;
                        };
                        permissions: string[];
                        restrictions?: {
                            /** @constant */
                            resource_type: "inference_endpoint";
                            patterns: string[];
                        }[];
                    }[];
                    global?: string[];
                    can_read_gated_repos?: boolean;
                };
            } | {
                /** @constant */
                type: "oauth";
                /** Format: date-time */
                expires_at?: string;
                scopes?: string[];
            } | {
                /** @constant */
                type: "app_token";
                role?: string;
                entities: {
                    /** @enum {string} */
                    type?: "model" | "dataset" | "space" | "bucket" | "kernel" | "org";
                    name: string;
                }[];
            } | {
                /** @constant */
                type: "other";
                /** Format: date-time */
                expires_at?: string;
            };
        } | {
            /** @constant */
            status: "anonymous";
            account: null;
            organizations: {
                id: string;
                name: string;
                display_name: string;
                /** Format: uri */
                url: string;
                role?: string;
                plan?: string;
                security_restrictions?: string[];
                resource_groups?: {
                    id: string;
                    name: string;
                    role: string;
                }[];
            }[];
            credential: null;
            guidance: string;
        } | {
            /** @constant */
            status: "authentication_unverified";
            account: null;
            organizations: {
                id: string;
                name: string;
                display_name: string;
                /** Format: uri */
                url: string;
                role?: string;
                plan?: string;
                security_restrictions?: string[];
                resource_groups?: {
                    id: string;
                    name: string;
                    role: string;
                }[];
            }[];
            credential: null;
            guidance: string;
        };
        HfWhoamiCallResult: components["schemas"]["CallToolResult"] & ({
            structuredContent: components["schemas"]["HfWhoamiOutput"];
        } | {
            /** @constant */
            isError: true;
        });
        HubRepoDetailsInput: {
            /** @description Repo IDs for (models|dataset/space) - usually in author/name format (e.g. openai/gpt-oss-120b) */
            repo_ids: string[];
            /**
             * @description Specify lookup type; otherwise auto-detects
             * @enum {string}
             */
            repo_type?: "model" | "dataset" | "space";
            /** @description Details to return. Defaults to ["overview"]. For datasets, prefer ["overview", "dataset_structure"] first; then call ["dataset_preview"] with config and split. */
            operations?: ("overview" | "dataset_structure" | "dataset_preview")[];
            /** @description Dataset Viewer config. Required for dataset_preview when the dataset has multiple config/split options. Discover via dataset_structure. */
            config?: string;
            /** @description Dataset Viewer split. Required for dataset_preview when the dataset has multiple config/split options. Discover via dataset_structure. */
            split?: string;
            /** @description Row offset for dataset_preview. Defaults to 0. */
            offset?: number;
            /** @description Row count for dataset_preview. Defaults to 5 and is clamped to 1-100. */
            limit?: number;
        };
        HfJobsRunArgs: {
            /** @description Job name, an alias for labels.name. Do not provide both. */
            name?: string;
            /** @description Job labels. Keys and values: max 100 characters; alphanumeric, dash, underscore. */
            labels?: {
                [key: string]: string;
            };
            /** @description Target namespace (username or organization). Defaults to current user. */
            namespace?: string;
            /** @description Enterprise resource group ID for billing attribution. Requires its organization as namespace. */
            resource_group_id?: string;
            /**
             * @description Docker image or HF Space URL (e.g., "python:3.12" or "hf.co/spaces/user/space")
             * @default python:3.12
             */
            image?: string;
            /** @description Command to execute. Arrays are literal argv (recommended, e.g., ["python", "script.py"]); no implicit shell execution. Strings tokenize quotes and escaping, not shell execution; shell operators are rejected. For pipes, chaining, redirections, or variable expansion, explicitly use ["/bin/sh", "-lc", "..."] only if the image provides that shell. For multiline scripts, use array with newlines in arguments. */
            command: string | string[];
            /**
             * @description Hardware flavor, e.g. cpu-basic, cpu-upgrade, cpu-performance, cpu-xl, t4-small, t4-medium, l4x1, l4x4, l40sx1, l40sx4, l40sx8, a10g-small, a10g-large, a10g-largex2, a10g-largex4, a100-large, a100x4, a100x8, h200, h200x2, h200x4, h200x8, rtx-pro-6000, rtx-pro-6000x2, rtx-pro-6000x4, rtx-pro-6000x8. Other flavors the Jobs API accepts also work.
             * @default cpu-basic
             */
            flavor?: string;
            /** @description Environment variables as key-value pairs */
            env?: {
                [key: string]: string;
            };
            /** @description Secrets as key-value pairs. Use HF_TOKEN=$HF_TOKEN to include your token */
            secrets?: {
                [key: string]: string;
            };
            /**
             * @description Max duration (e.g., "5m", "2h", "30s"). Default: 30m
             * @default 30m
             */
            timeout?: string;
            /** @description Volume mounts using hf:// URLs. Format: hf://TYPE/OWNER/NAME[/PATH]:/MOUNT_PATH[:ro|:rw]. TYPE is models, datasets, spaces, or buckets. Examples: ["hf://datasets/org/ds:/data:ro", "hf://buckets/org/b:/output"]. */
            volumes?: string[];
            /**
             * @description If true, return immediately with job ID. If false (default), tail logs for up to 10 seconds.
             * @default false
             */
            detach?: boolean;
        };
        HfJobsUvArgs: {
            /** @description Job name, an alias for labels.name. Do not provide both. */
            name?: string;
            /** @description Job labels. Keys and values: max 100 characters; alphanumeric, dash, underscore. */
            labels?: {
                [key: string]: string;
            };
            /** @description Target namespace (username or organization). Defaults to current user. */
            namespace?: string;
            /** @description Enterprise resource group ID for billing attribution. Requires its organization as namespace. */
            resource_group_id?: string;
            /** @description Python script: local file path, URL, or inline code. UV will handle dependencies automatically. */
            script: string;
            /** @description Additional package dependencies */
            with_deps?: string[];
            /** @description Arguments to pass to the script */
            script_args?: string[];
            /** @description Python interpreter version (e.g., "3.12") */
            python?: string;
            /**
             * @description Hardware flavor
             * @default cpu-basic
             */
            flavor?: string;
            /** @description Environment variables as key-value pairs */
            env?: {
                [key: string]: string;
            };
            /** @description Secrets as key-value pairs. Use HF_TOKEN=$HF_TOKEN to include your token */
            secrets?: {
                [key: string]: string;
            };
            /**
             * @description Max duration
             * @default 30m
             */
            timeout?: string;
            /** @description Volume mounts using hf:// URLs. Format: hf://TYPE/OWNER/NAME[/PATH]:/MOUNT_PATH[:ro|:rw]. TYPE is models, datasets, spaces, or buckets. */
            volumes?: string[];
            /**
             * @description If true, return immediately with job ID. If false (default), tail logs for up to 10 seconds.
             * @default false
             */
            detach?: boolean;
        };
        HfJobsPsArgs: {
            /** @description Target namespace (username or organization). Defaults to current user. */
            namespace?: string;
            /** @description Match all supplied labels. */
            labels?: {
                [key: string]: string;
            };
            /**
             * @description Show all jobs (default: only running)
             * @default false
             */
            all?: boolean;
            /** @description Filter by status ("RUNNING", "COMPLETED", "CANCELED", "ERROR", "DELETED") */
            status?: string;
        };
        HfJobsLogsArgs: {
            /** @description Target namespace (username or organization). Defaults to current user. */
            namespace?: string;
            /** @description Job ID to fetch logs from */
            job_id: string;
            /**
             * @description Number of lines to return (default: 20, max 2000)
             * @default 20
             */
            tail?: number;
        };
        HfJobsInspectArgs: {
            /** @description Target namespace (username or organization). Defaults to current user. */
            namespace?: string;
            /** @description Job ID(s) to inspect */
            job_id: string | string[];
        };
        HfJobsCancelArgs: {
            /** @description Target namespace (username or organization). Defaults to current user. */
            namespace?: string;
            /** @description Job ID to cancel */
            job_id: string;
        };
        HfJobsUpdateLabelsArgs: {
            /** @description Target namespace (username or organization). Defaults to current user. */
            namespace?: string;
            /** @description Job ID whose labels to update */
            job_id: string;
            /** @description Replace all job labels. An empty object clears all labels. */
            labels: {
                [key: string]: string;
            };
        };
        HfJobsScheduledUpdateLabelsArgs: {
            /** @description Target namespace (username or organization). Defaults to current user. */
            namespace?: string;
            /** @description Scheduled job ID */
            scheduled_job_id: string;
            /** @description Replace all scheduled job labels. An empty object clears all labels. */
            labels: {
                [key: string]: string;
            };
        };
        HfJobsScheduledRunArgs: {
            /** @description Job name, an alias for labels.name. Do not provide both. */
            name?: string;
            /** @description Job labels. Keys and values: max 100 characters; alphanumeric, dash, underscore. */
            labels?: {
                [key: string]: string;
            };
            /** @description Target namespace (username or organization). Defaults to current user. */
            namespace?: string;
            /** @description Enterprise resource group ID for billing attribution. Requires its organization as namespace. */
            resource_group_id?: string;
            /**
             * @description Docker image or HF Space URL (e.g., "python:3.12" or "hf.co/spaces/user/space")
             * @default python:3.12
             */
            image?: string;
            /** @description Command to execute. Arrays are literal argv (recommended, e.g., ["python", "script.py"]); no implicit shell execution. Strings tokenize quotes and escaping, not shell execution; shell operators are rejected. For pipes, chaining, redirections, or variable expansion, explicitly use ["/bin/sh", "-lc", "..."] only if the image provides that shell. For multiline scripts, use array with newlines in arguments. */
            command: string | string[];
            /**
             * @description Hardware flavor, e.g. cpu-basic, cpu-upgrade, cpu-performance, cpu-xl, t4-small, t4-medium, l4x1, l4x4, l40sx1, l40sx4, l40sx8, a10g-small, a10g-large, a10g-largex2, a10g-largex4, a100-large, a100x4, a100x8, h200, h200x2, h200x4, h200x8, rtx-pro-6000, rtx-pro-6000x2, rtx-pro-6000x4, rtx-pro-6000x8. Other flavors the Jobs API accepts also work.
             * @default cpu-basic
             */
            flavor?: string;
            /** @description Environment variables as key-value pairs */
            env?: {
                [key: string]: string;
            };
            /** @description Secrets as key-value pairs. Use HF_TOKEN=$HF_TOKEN to include your token */
            secrets?: {
                [key: string]: string;
            };
            /**
             * @description Max duration (e.g., "5m", "2h", "30s"). Default: 30m
             * @default 30m
             */
            timeout?: string;
            /** @description Volume mounts using hf:// URLs. Format: hf://TYPE/OWNER/NAME[/PATH]:/MOUNT_PATH[:ro|:rw]. TYPE is models, datasets, spaces, or buckets. Examples: ["hf://datasets/org/ds:/data:ro", "hf://buckets/org/b:/output"]. */
            volumes?: string[];
            /**
             * @description If true, return immediately with job ID. If false (default), tail logs for up to 10 seconds.
             * @default false
             */
            detach?: boolean;
            /** @description Schedule: cron expression or shorthand (@hourly, @daily, @weekly, @monthly, @yearly) */
            schedule: string;
            /**
             * @description Create in suspended state
             * @default false
             */
            suspend?: boolean;
        };
        HfJobsScheduledUvArgs: {
            /** @description Job name, an alias for labels.name. Do not provide both. */
            name?: string;
            /** @description Job labels. Keys and values: max 100 characters; alphanumeric, dash, underscore. */
            labels?: {
                [key: string]: string;
            };
            /** @description Target namespace (username or organization). Defaults to current user. */
            namespace?: string;
            /** @description Enterprise resource group ID for billing attribution. Requires its organization as namespace. */
            resource_group_id?: string;
            /** @description Python script: local file path, URL, or inline code. UV will handle dependencies automatically. */
            script: string;
            /** @description Additional package dependencies */
            with_deps?: string[];
            /** @description Arguments to pass to the script */
            script_args?: string[];
            /** @description Python interpreter version (e.g., "3.12") */
            python?: string;
            /**
             * @description Hardware flavor
             * @default cpu-basic
             */
            flavor?: string;
            /** @description Environment variables as key-value pairs */
            env?: {
                [key: string]: string;
            };
            /** @description Secrets as key-value pairs. Use HF_TOKEN=$HF_TOKEN to include your token */
            secrets?: {
                [key: string]: string;
            };
            /**
             * @description Max duration
             * @default 30m
             */
            timeout?: string;
            /** @description Volume mounts using hf:// URLs. Format: hf://TYPE/OWNER/NAME[/PATH]:/MOUNT_PATH[:ro|:rw]. TYPE is models, datasets, spaces, or buckets. */
            volumes?: string[];
            /**
             * @description If true, return immediately with job ID. If false (default), tail logs for up to 10 seconds.
             * @default false
             */
            detach?: boolean;
            /** @description Schedule: cron expression or shorthand */
            schedule: string;
            /**
             * @description Create in suspended state
             * @default false
             */
            suspend?: boolean;
        };
        HfJobsScheduledPsArgs: {
            /** @description Target namespace (username or organization). Defaults to current user. */
            namespace?: string;
            /** @description Match all supplied labels. */
            labels?: {
                [key: string]: string;
            };
            /**
             * @description Show all scheduled jobs (default: hide suspended)
             * @default false
             */
            all?: boolean;
        };
        HfJobsScheduledInspectArgs: {
            /** @description Target namespace (username or organization). Defaults to current user. */
            namespace?: string;
            /** @description Scheduled job ID */
            scheduled_job_id: string;
        };
        HfJobsScheduledDeleteArgs: {
            /** @description Target namespace (username or organization). Defaults to current user. */
            namespace?: string;
            /** @description Scheduled job ID */
            scheduled_job_id: string;
        };
        HfJobsScheduledSuspendArgs: {
            /** @description Target namespace (username or organization). Defaults to current user. */
            namespace?: string;
            /** @description Scheduled job ID */
            scheduled_job_id: string;
        };
        HfJobsScheduledResumeArgs: {
            /** @description Target namespace (username or organization). Defaults to current user. */
            namespace?: string;
            /** @description Scheduled job ID */
            scheduled_job_id: string;
        };
        RequestId: string | number;
        InitializeResult: {
            _meta?: {
                "io.modelcontextprotocol/serverInfo"?: {
                    name: string;
                    title?: string;
                    icons?: {
                        src: string;
                        mimeType?: string;
                        sizes?: string[];
                        /** @enum {string} */
                        theme?: "light" | "dark";
                    }[];
                    version: string;
                    websiteUrl?: string;
                    description?: string;
                };
            } & {
                [key: string]: unknown;
            };
            protocolVersion: string;
            capabilities: {
                experimental?: {
                    [key: string]: {
                        [key: string]: unknown;
                    };
                };
                logging?: {
                    [key: string]: unknown;
                };
                completions?: {
                    [key: string]: unknown;
                };
                prompts?: {
                    listChanged?: boolean;
                };
                resources?: {
                    subscribe?: boolean;
                    listChanged?: boolean;
                };
                tools?: {
                    listChanged?: boolean;
                };
                tasks?: {
                    list?: {
                        [key: string]: unknown;
                    };
                    cancel?: {
                        [key: string]: unknown;
                    };
                    requests?: {
                        tools?: {
                            call?: {
                                [key: string]: unknown;
                            };
                        } & {
                            [key: string]: unknown;
                        };
                    } & {
                        [key: string]: unknown;
                    };
                } & {
                    [key: string]: unknown;
                };
                extensions?: {
                    [key: string]: {
                        [key: string]: unknown;
                    };
                };
            };
            serverInfo: {
                name: string;
                title?: string;
                icons?: {
                    src: string;
                    mimeType?: string;
                    sizes?: string[];
                    /** @enum {string} */
                    theme?: "light" | "dark";
                }[];
                version: string;
                websiteUrl?: string;
                description?: string;
            };
            instructions?: string;
        } & {
            [key: string]: unknown;
        };
        ListToolsResult: {
            _meta?: {
                "io.modelcontextprotocol/serverInfo"?: {
                    name: string;
                    title?: string;
                    icons?: {
                        src: string;
                        mimeType?: string;
                        sizes?: string[];
                        /** @enum {string} */
                        theme?: "light" | "dark";
                    }[];
                    version: string;
                    websiteUrl?: string;
                    description?: string;
                };
            } & {
                [key: string]: unknown;
            };
            nextCursor?: string;
            tools: {
                name: string;
                title?: string;
                icons?: {
                    src: string;
                    mimeType?: string;
                    sizes?: string[];
                    /** @enum {string} */
                    theme?: "light" | "dark";
                }[];
                description?: string;
                inputSchema: {
                    /** @constant */
                    type: "object";
                    properties?: {
                        [key: string]: unknown;
                    };
                    required?: string[];
                } & {
                    [key: string]: unknown;
                };
                outputSchema?: {
                    $schema?: string;
                } & {
                    [key: string]: unknown;
                };
                annotations?: {
                    title?: string;
                    readOnlyHint?: boolean;
                    destructiveHint?: boolean;
                    idempotentHint?: boolean;
                    openWorldHint?: boolean;
                };
                execution?: {
                    /** @enum {string} */
                    taskSupport?: "required" | "optional" | "forbidden";
                };
                _meta?: {
                    [key: string]: unknown;
                };
            }[];
        } & {
            [key: string]: unknown;
        };
        CallToolResult: {
            _meta?: {
                "io.modelcontextprotocol/serverInfo"?: {
                    name: string;
                    title?: string;
                    icons?: {
                        src: string;
                        mimeType?: string;
                        sizes?: string[];
                        /** @enum {string} */
                        theme?: "light" | "dark";
                    }[];
                    version: string;
                    websiteUrl?: string;
                    description?: string;
                };
            } & {
                [key: string]: unknown;
            };
            /** @default [] */
            content: ({
                /** @constant */
                type: "text";
                text: string;
                annotations?: {
                    audience?: ("user" | "assistant")[];
                    priority?: number;
                    /** Format: date-time */
                    lastModified?: string;
                };
                _meta?: {
                    [key: string]: unknown;
                };
            } | {
                /** @constant */
                type: "image";
                data: string;
                mimeType: string;
                annotations?: {
                    audience?: ("user" | "assistant")[];
                    priority?: number;
                    /** Format: date-time */
                    lastModified?: string;
                };
                _meta?: {
                    [key: string]: unknown;
                };
            } | {
                /** @constant */
                type: "audio";
                data: string;
                mimeType: string;
                annotations?: {
                    audience?: ("user" | "assistant")[];
                    priority?: number;
                    /** Format: date-time */
                    lastModified?: string;
                };
                _meta?: {
                    [key: string]: unknown;
                };
            } | {
                name: string;
                title?: string;
                icons?: {
                    src: string;
                    mimeType?: string;
                    sizes?: string[];
                    /** @enum {string} */
                    theme?: "light" | "dark";
                }[];
                uri: string;
                description?: string;
                mimeType?: string;
                size?: number;
                annotations?: {
                    audience?: ("user" | "assistant")[];
                    priority?: number;
                    /** Format: date-time */
                    lastModified?: string;
                };
                _meta?: {
                    [key: string]: unknown;
                };
                /** @constant */
                type: "resource_link";
            } | {
                /** @constant */
                type: "resource";
                resource: {
                    uri: string;
                    mimeType?: string;
                    _meta?: {
                        [key: string]: unknown;
                    };
                    text: string;
                } | {
                    uri: string;
                    mimeType?: string;
                    _meta?: {
                        [key: string]: unknown;
                    };
                    blob: string;
                };
                annotations?: {
                    audience?: ("user" | "assistant")[];
                    priority?: number;
                    /** Format: date-time */
                    lastModified?: string;
                };
                _meta?: {
                    [key: string]: unknown;
                };
            })[];
            structuredContent?: unknown;
            isError?: boolean;
        } & {
            [key: string]: unknown;
        };
        EmptyResult: {
            _meta?: {
                "io.modelcontextprotocol/serverInfo"?: {
                    name: string;
                    title?: string;
                    icons?: {
                        src: string;
                        mimeType?: string;
                        sizes?: string[];
                        /** @enum {string} */
                        theme?: "light" | "dark";
                    }[];
                    version: string;
                    websiteUrl?: string;
                    description?: string;
                };
            } & {
                [key: string]: unknown;
            };
        };
        JsonRpcError: {
            /** @constant */
            jsonrpc: "2.0";
            id?: components["schemas"]["RequestId"] | null;
            error: {
                code: number;
                message: string;
                data?: unknown;
            };
        };
        InitializeRequest: {
            /** @constant */
            method: "initialize";
            params: {
                _meta?: {
                    progressToken?: string | number;
                    "io.modelcontextprotocol/related-task"?: {
                        taskId: string;
                    };
                } & {
                    [key: string]: unknown;
                };
                protocolVersion: string;
                capabilities: {
                    experimental?: {
                        [key: string]: {
                            [key: string]: unknown;
                        };
                    };
                    sampling?: {
                        context?: {
                            [key: string]: unknown;
                        };
                        tools?: {
                            [key: string]: unknown;
                        };
                    };
                    elicitation?: {
                        form?: {
                            applyDefaults?: boolean;
                        } & {
                            [key: string]: unknown;
                        };
                        url?: {
                            [key: string]: unknown;
                        };
                    } & {
                        [key: string]: unknown;
                    };
                    roots?: {
                        listChanged?: boolean;
                    };
                    tasks?: {
                        list?: {
                            [key: string]: unknown;
                        };
                        cancel?: {
                            [key: string]: unknown;
                        };
                        requests?: {
                            sampling?: {
                                createMessage?: {
                                    [key: string]: unknown;
                                };
                            } & {
                                [key: string]: unknown;
                            };
                            elicitation?: {
                                create?: {
                                    [key: string]: unknown;
                                };
                            } & {
                                [key: string]: unknown;
                            };
                        } & {
                            [key: string]: unknown;
                        };
                    } & {
                        [key: string]: unknown;
                    };
                    extensions?: {
                        [key: string]: {
                            [key: string]: unknown;
                        };
                    };
                };
                clientInfo: {
                    name: string;
                    title?: string;
                    icons?: {
                        src: string;
                        mimeType?: string;
                        sizes?: string[];
                        /** @enum {string} */
                        theme?: "light" | "dark";
                    }[];
                    version: string;
                    websiteUrl?: string;
                    description?: string;
                };
            };
            /** @constant */
            jsonrpc: "2.0";
            id: components["schemas"]["RequestId"];
        };
        InitializedNotification: {
            /** @constant */
            method: "notifications/initialized";
            params?: {
                _meta?: {
                    progressToken?: string | number;
                    "io.modelcontextprotocol/related-task"?: {
                        taskId: string;
                    };
                } & {
                    [key: string]: unknown;
                };
            };
            /** @constant */
            jsonrpc: "2.0";
        };
        PingRequest: {
            /** @constant */
            method: "ping";
            params?: {
                _meta?: {
                    progressToken?: string | number;
                    "io.modelcontextprotocol/related-task"?: {
                        taskId: string;
                    };
                } & {
                    [key: string]: unknown;
                };
            };
            /** @constant */
            jsonrpc: "2.0";
            id: components["schemas"]["RequestId"];
        };
        ListToolsRequest: {
            /** @constant */
            method: "tools/list";
            params?: {
                _meta?: {
                    progressToken?: string | number;
                    "io.modelcontextprotocol/related-task"?: {
                        taskId: string;
                    };
                } & {
                    [key: string]: unknown;
                };
                cursor?: string;
            };
            /** @constant */
            jsonrpc: "2.0";
            id: components["schemas"]["RequestId"];
        };
        CallToolRequest: {
            /** @constant */
            method: "tools/call";
            params: {
                _meta?: {
                    progressToken?: string | number;
                    "io.modelcontextprotocol/related-task"?: {
                        taskId: string;
                    };
                } & {
                    [key: string]: unknown;
                };
                task?: {
                    ttl?: number;
                };
                name: string;
                arguments?: {
                    [key: string]: unknown;
                };
            } & ({
                /** @constant */
                name: "create_repo";
                arguments: components["schemas"]["CreateRepoInput"];
            } | {
                /** @constant */
                name: "hf_fs";
                arguments: components["schemas"]["HfFsInput"];
            } | {
                /** @constant */
                name: "hf_fs_write";
                arguments: components["schemas"]["HfFsWriteInput"];
            } | {
                /** @constant */
                name: "hf_jobs";
                arguments?: components["schemas"]["HfJobsInput"];
            } | {
                /** @constant */
                name: "hf_sandbox";
                arguments: components["schemas"]["HfSandboxInput"];
            } | {
                /** @constant */
                name: "hf_sandbox_exec";
                arguments: components["schemas"]["HfSandboxExecInput"];
            } | {
                /** @constant */
                name: "hf_sandbox_fs";
                arguments: components["schemas"]["HfSandboxFsInput"];
            } | {
                /** @constant */
                name: "hf_whoami";
                arguments?: components["schemas"]["HfWhoamiInput"];
            } | {
                /** @constant */
                name: "hub_repo_details";
                arguments: components["schemas"]["HubRepoDetailsInput"];
            });
            /** @constant */
            jsonrpc: "2.0";
            id: components["schemas"]["RequestId"];
        };
        CancelledNotification: {
            /** @constant */
            method: "notifications/cancelled";
            params: {
                _meta?: {
                    progressToken?: string | number;
                    "io.modelcontextprotocol/related-task"?: {
                        taskId: string;
                    };
                } & {
                    [key: string]: unknown;
                };
                requestId?: string | number;
                reason?: string;
            };
            /** @constant */
            jsonrpc: "2.0";
        };
        McpClientMessage: components["schemas"]["InitializeRequest"] | components["schemas"]["InitializedNotification"] | components["schemas"]["PingRequest"] | components["schemas"]["ListToolsRequest"] | components["schemas"]["CallToolRequest"] | components["schemas"]["CancelledNotification"];
        McpSuccess: {
            /** @constant */
            jsonrpc: "2.0";
            id: components["schemas"]["RequestId"];
            result: components["schemas"]["InitializeResult"] | components["schemas"]["ListToolsResult"] | components["schemas"]["EmptyResult"] | components["schemas"]["CreateRepoCallResult"] | components["schemas"]["HfFsCallResult"] | components["schemas"]["HfFsWriteCallResult"] | components["schemas"]["HfJobsCallResult"] | components["schemas"]["HfSandboxCallResult"] | components["schemas"]["HfSandboxExecCallResult"] | components["schemas"]["HfSandboxFsCallResult"] | components["schemas"]["HfWhoamiCallResult"] | components["schemas"]["CallToolResult"];
        };
        McpResponse: components["schemas"]["McpSuccess"] | components["schemas"]["JsonRpcError"];
    };
    responses: never;
    parameters: never;
    requestBodies: never;
    headers: never;
    pathItems: never;
}
export type $defs = Record<string, never>;
export interface operations {
    postMcpMessage: {
        parameters: {
            query: {
                bouquet: "intern";
                /** @description Presence of this marker requires authentication, as in ?login&bouquet=intern. */
                login?: string;
            };
            header?: {
                /** @description Send the negotiated version on requests after initialization. */
                "MCP-Protocol-Version"?: string;
                /** @description When initialization supplies a session ID, send it on subsequent requests. */
                "Mcp-Session-Id"?: string;
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["McpClientMessage"];
            };
        };
        responses: {
            /** @description JSON-RPC response on this JSON-mode endpoint. Its ID correlates it with the request. */
            200: {
                headers: {
                    /** @description May be returned during initialization. */
                    "Mcp-Session-Id"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["McpResponse"];
                };
            };
            /** @description Notification accepted. */
            202: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Invalid MCP request or unsupported protocol version. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Authentication required or rejected. */
            401: {
                headers: {
                    "WWW-Authenticate"?: string;
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Access denied. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description The Accept header must include both application/json and text/event-stream. */
            406: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["JsonRpcError"];
                };
            };
        };
    };
}
