import { ActionPanel, List, Action, showToast, Toast } from "@raycast/api";
import { useState, useEffect } from "react";
import fetch from "node-fetch";
import { llmService } from "./services/llm/anthropic";
import { serverManager } from "./server/index";

interface FileItem {
  name: string;
  path: string;
  type: string;
  preview?: string;
  size?: number;
}

interface SearchResponse {
  files: FileItem[];
  page: number;
  hasMore: boolean;
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
  const [isServerReady, setIsServerReady] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [serverPort, setServerPort] = useState<number | null>(null);

  // Check server status and get port
  useEffect(() => {
    const checkServer = async () => {
      try {
        if (!serverManager.ready) {
          setIsLoading(true);
          await serverManager.start();
        }
        setIsServerReady(true);
        setServerPort(serverManager.getPort());
      } catch (error) {
        console.error("Server initialization failed:", error);
        showToast({
          style: Toast.Style.Failure,
          title: "Server initialization failed",
          message: error instanceof Error ? error.message : "Unknown error"
        });
      } finally {
        setIsLoading(false);
      }
    };

    checkServer();
  }, []);

  async function handleSearch(text: string, page: number = 1) {
    if (!isServerReady || !serverPort) {
      showToast({
        style: Toast.Style.Failure,
        title: "Server not ready",
        message: "Please wait for the server to initialize"
      });
      return;
    }

    setIsLoading(true);
    if (page === 1) {
      setItems([]);
      setAnswer(null);
    }

    try {
      if (!text.trim()) {
        setIsLoading(false);
        return;
      }

      console.log("Analyzing query:", text);
      
      const intent = await llmService.classifyIntent(text);
      console.log("Query intent:", intent);

      const mode = intent.intent === 'ANSWER_QUESTION' ? 'content' : 'title';
      
      const response = await fetch(
        `http://localhost:${serverPort}/search?q=${encodeURIComponent(text)}&mode=${mode}&page=${page}`
      );
      
      if (!response.ok) {
        throw new Error("Failed to fetch files");
      }

      const data = await response.json() as SearchResponse;
      console.log("Received items:", data);
      
      if (intent.intent === 'ANSWER_QUESTION' && data.files.length > 0) {
        const relevantContent = data.files
          .map(file => file.preview)
          .filter(Boolean)
          .join("\n\n");

        if (relevantContent) {
          const answer = await llmService.generateAnswer(text, relevantContent);
          setAnswer(answer);
        }
      }
      
      const filteredItems = data.files.filter(file => 
        mode === 'title' ? fuzzyMatch(file.name.toLowerCase(), text.toLowerCase()) : true
      );
      
      setItems(prev => page === 1 ? filteredItems : [...prev, ...filteredItems]);
      setCurrentPage(data.page);
      setHasMore(data.hasMore);
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
      searchBarPlaceholder={isServerReady ? "Search files... (Press ⌘+Enter to search)" : "Initializing server..."}
      isLoading={isLoading}
      onSearchTextChange={(text) => {
        setSearchText(text);
      }}
      searchText={searchText}
      throttle={false}
      actions={
        <ActionPanel>
          <Action
            title="Search"
            onAction={() => handleSearch(searchText, 1)}
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
      
      <List.Section 
        title="Results" 
        subtitle={items.length > 0 ? `${items.length} files found${hasMore ? ' (scroll for more)' : ''}` : undefined}
      >
        {items.map((file, index) => (
          <List.Item
            key={`${file.path}-${index}`}
            title={file.name}
            subtitle={file.preview}
            accessoryTitle={`${file.type}${file.size ? ` • ${(file.size / 1024 / 1024).toFixed(1)}MB` : ''}`}
            actions={
              <ActionPanel>
                <Action
                  title="Open File"
                  onAction={async () => {
                    try {
                      const response = await fetch(
                        `http://localhost:${serverPort}/file?path=${encodeURIComponent(file.path)}`
                      );
                      if (!response.ok) {
                        throw new Error("Failed to fetch file content");
                      }
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
        {hasMore && !isLoading && (
          <List.Item
            title="Load More..."
            actions={
              <ActionPanel>
                <Action
                  title="Load More"
                  onAction={() => handleSearch(searchText, currentPage + 1)}
                />
              </ActionPanel>
            }
          />
        )}
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