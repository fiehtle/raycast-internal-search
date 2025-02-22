import { ActionPanel, List, Action, showToast, Toast } from "@raycast/api";
import { useState, useEffect } from "react";
import fetch from "node-fetch";

interface SearchResult {
  path: string;
  name: string;
  type: string;
  content_preview: string;
  score: number;
}

interface SearchResponse {
  results?: SearchResult[];
  error?: string;
}

const SERVER_PORT = 49152; // Starting port, will try up to 49162
const SERVER_URL = `http://localhost:${SERVER_PORT}`;

export default function Command() {
  const [searchText, setSearchText] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let timeoutId: NodeJS.Timeout | undefined;

    const performSearch = async () => {
      // Don't search if query is empty
      if (!searchText.trim()) {
        setResults([]);
        setError(null);
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        const response = await fetch(`${SERVER_URL}/search?q=${encodeURIComponent(searchText)}`);
        const data = await response.json() as SearchResponse;
        
        if (!response.ok) {
          throw new Error(data.error || 'Search failed');
        }

        setResults(data.results || []);
      } catch (error) {
        console.error('Search error:', error);
        const errorMessage = error instanceof Error ? error.message : 'Search failed';
        setError(errorMessage);
        showToast({
          style: Toast.Style.Failure,
          title: "Search failed",
          message: "Make sure the search server is running (npm run server)"
        });
        setResults([]);
      } finally {
        setIsLoading(false);
      }
    };

    // Clear previous timeout
    if (timeoutId) {
      clearTimeout(timeoutId);
    }

    // Only search if query is not empty and has at least 2 characters
    if (searchText.trim().length >= 2) {
      timeoutId = setTimeout(performSearch, 300);
    } else {
      setResults([]);
      setError(null);
      setIsLoading(false);
    }

    return () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [searchText]);

  return (
    <List
      isLoading={isLoading}
      onSearchTextChange={setSearchText}
      searchBarPlaceholder="Type at least 2 characters to search..."
      throttle
    >
      {error ? (
        <List.EmptyView
          title="Error"
          description={error}
          icon={{ source: { light: "error-light.png", dark: "error-dark.png" } }}
        />
      ) : searchText.trim().length < 2 ? (
        <List.EmptyView
          title="Start typing to search"
          description="Enter at least 2 characters to begin search"
        />
      ) : results.length === 0 ? (
        <List.EmptyView
          title="No results found"
          description="Try a different search term"
        />
      ) : (
        results.map((item) => (
          <List.Item
            key={item.path}
            title={item.name}
            subtitle={item.content_preview}
            accessories={[
              { text: `${Math.round(item.score * 100)}% match` },
              { text: item.type }
            ]}
            actions={
              <ActionPanel>
                <Action.Open title="Open File" target={item.path} />
                <Action.ShowInFinder path={item.path} />
                <Action.CopyToClipboard content={item.path} />
              </ActionPanel>
            }
          />
        ))
      )}
    </List>
  );
}