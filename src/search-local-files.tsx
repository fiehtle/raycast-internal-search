import { ActionPanel, List, Action, showToast, Toast } from "@raycast/api";
import { useState } from "react";
import fetch from "node-fetch";

interface FileItem {
  name: string;
  path: string;
  type: string;
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

  async function handleSearch(text: string) {
    setSearchText(text);
    setIsLoading(true);
    setItems([]); // Clear previous results immediately

    try {
      // If search is cleared, reset results
      if (!text.trim()) {
        setIsLoading(false);
        return;
      }

      console.log("Searching for:", text);
      
      // Always fetch fresh results from the server
      const response = await fetch(`http://localhost:3000/search?q=${encodeURIComponent(text)}`);
      
      if (!response.ok) {
        throw new Error("Failed to fetch files");
      }

      const data = await response.json() as SearchResponse;
      console.log("Received items:", data);
      
      // Apply additional fuzzy filtering on the results
      const filteredItems = data.files.filter(file => 
        fuzzyMatch(file.name.toLowerCase(), text.toLowerCase())
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
      searchBarPlaceholder="Search files..."
      isLoading={isLoading}
      onSearchTextChange={handleSearch}
      searchText={searchText}
      throttle={true}
    >
      <List.Section title="Results" subtitle={items.length > 0 ? `${items.length} files found` : undefined}>
        {items.map((file, index) => (
          <List.Item
            key={`${file.path}-${index}`}
            title={file.name}
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