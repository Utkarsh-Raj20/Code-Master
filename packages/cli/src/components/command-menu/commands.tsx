import type { Command } from "./types";

export const COMMANDS: Command[] = [
  {
    name:"new",
    description:"Start a new conversation",
    value:"/new"
  },
  {
    name:"models",
    description:"Select AI model for generation",
    value:"/models"
  },
  {
    name:"agents",
    description:"Switch agents",
    value:"/agents"
  },
  {
    name:"session",
    description:"Browser past sessions",
    value:"/sessions"
  },
  {
    name:"theme",
    description:"Change color theme",
    value:"/theme"
  },
  {
    name:"login",
    description:"Sign in with your borwser",
    value:"/login"
  },
  {
    name:"logout",
    description:"Sign out of your account",
    value:"/usage"
  },
  {
    name:"upgrage",
    description:"Buy more credits",
    value:"/upgrade"
  },
  {
    name:"usage",
    description:"Open billing portal in your browser",
    value:"/usage"
  },
  {
    name:"exit",
    description:"Quit the application",
    action:(ctx)=>{
      ctx.exit();
    },
    value:"/exit"
  },
];
