import { ActionPanel, List, Action, showToast, Toast } from "@raycast/api";
import { useState } from "react";
import fetch from "node-fetch";
import { llmService } from "./services/llm/anthropic";

interface FileItem {
  name: string;
  path: string;
  type: string;
  preview?: string;
}

interface SearchResponse {
  files: FileItem[];
}

// Simple fuzzy search helper
function fuzzyMatch(text: string, query: string): boolean {
  const pattern = query.split("").map(char => 
    char.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  ).join('.*');
  const regex = new RegExp(pattern, 'i');
  return regex.test(text);
}

export default function Command() {
  const [searchText, setSearchText] = useState<string>("");
  const [items, setItems] = useState<FileItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [answer, setAnswer] = useState<string | null>(null);

  async function handleSearch(text: string) {
    setIsLoading(true);
    setItems([]); // Clear previous results immediately
    setAnswer(null); // Clear previous answer

    try {
      // If search is cleared, reset results
      if (!text.trim()) {
        setIsLoading(false);
        return;
      }

      console.log("Analyzing query:", text);
      
      // Use LLM to determine search intent
      const intent = await llmService.classifyIntent(text);
      console.log("Query intent:", intent);

      // Determine search mode based on intent
      const mode = intent.intent === 'ANSWER_QUESTION' ? 'content' : 'title';
      
      // Always fetch fresh results from the server
      const response = await fetch(
        `http://localhost:3000/search?q=${encodeURIComponent(text)}&mode=${mode}`
      );
      
      if (!response.ok) {
        throw new Error("Failed to fetch files");
      }

      const data = await response.json() as SearchResponse;
      console.log("Received items:", data);
      
      if (intent.intent === 'ANSWER_QUESTION' && data.files.length > 0) {
        // Get content from relevant files and use LLM to generate an answer
        const relevantContent = data.files
          .map(file => file.preview)
          .filter(Boolean)
          .join("\n\n");

        if (relevantContent) {
          const answer = await llmService.generateAnswer(text, relevantContent);
          setAnswer(answer);
        }
      }
      
      // Apply additional fuzzy filtering on the results
      const filteredItems = data.files.filter(file => 
        mode === 'title' ? fuzzyMatch(file.name.toLowerCase(), text.toLowerCase()) : true
      );
      
      setItems(filteredItems);
    } catch (error) {
      console.error("Search error:", error);
      showToast({
        style: Toast.Style.Failure,
        title: "Failed to search files",
        message: error instanceof Error ? error.message : "Something went wrong",
      });
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <List
      searchBarPlaceholder="Search files... (Press ⌘+Enter to search)"
      isLoading={isLoading}
      onSearchTextChange={(text) => {
        setSearchText(text);
        // Commented out for now - search on type behavior
        // handleSearch(text);
      }}
      searchText={searchText}
      throttle={false}
      actions={
        <ActionPanel>
          <Action
            title="Search"
            onAction={() => handleSearch(searchText)}
            shortcut={{ modifiers: ["cmd"], key: "return" }}
          />
        </ActionPanel>
      }
    >
      {answer && (
        <List.Section title="Answer">
          <List.Item
            title={answer}
            actions={
              <ActionPanel>
                <Action.CopyToClipboard
                  title="Copy Answer"
                  content={answer}
                />
              </ActionPanel>
            }
          />
        </List.Section>
      )}
      
      <List.Section title="Results" subtitle={items.length > 0 ? `${items.length} files found` : undefined}>
        {items.map((file, index) => (
          <List.Item
            key={`${file.path}-${index}`}
            title={file.name}
            subtitle={file.preview}
            accessoryTitle={file.type}
            actions={
              <ActionPanel>
                <Action
                  title="Open File"
                  onAction={async () => {
                    try {
                      const response = await fetch(
                        `http://localhost:3000/file?path=${encodeURIComponent(file.path)}`
                      );
                      if (!response.ok) {
                        throw new Error("Failed to fetch file content");
                      }
                      // TODO: Handle file content based on type
                      console.log(`Fetched file: ${file.path}`);
                    } catch (error) {
                      showToast({
                        style: Toast.Style.Failure,
                        title: "Failed to open file",
                        message: error instanceof Error ? error.message : "Something went wrong",
                      });
                    }
                  }}
                />
              </ActionPanel>
            }
          />
        ))}
      </List.Section>

      {searchText !== "" && items.length === 0 && !isLoading && (
        <List.EmptyView
          title="No files found"
          description={`No files matching "${searchText}"`}
        />
      )}
    </List>
  );
}