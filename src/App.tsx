import { useState } from "react";
import Workspace from "./components/Workspace";
import { starterContent } from "./lib/starterContent";

function App() {
  const [text, setText] = useState(starterContent);
  return <Workspace text={text} onTextChange={setText} />;
}

export default App;
