import { useStore } from './state/store';
import { getActiveProject } from './state/selectors';
import ProjectPicker from './screens/ProjectPicker';
import Workbench from './screens/Workbench';

export default function App() {
  const [state, dispatch] = useStore();
  const activeProject = getActiveProject(state);

  if (!activeProject) {
    return <ProjectPicker state={state} dispatch={dispatch} />;
  }

  return <Workbench project={activeProject} dispatch={dispatch} />;
}
