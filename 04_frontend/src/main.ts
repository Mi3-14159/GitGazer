import "./assets/main.css";

import { createApp } from "vue";
import { createPinia } from "pinia";
import App from "./App.vue";
import { Amplify } from "aws-amplify";

Amplify.configure({
  Auth: {
    region: 'eu-central-1',
    userPoolId: 'eu-central-1_jiNhU0Qss',
    userPoolWebClientId: '4e72rp40t6sh94vpg0fkp3vit1',
    mandatorySignIn: false,
    oauth: {
      domain: `default-gitgazer.auth.eu-central-1.amazoncognito.com`,
      scope: ["email", "profile", "openid", "aws.cognito.signin.user.admin"],
      //redirectSignIn: "http://localhost:5173", // TODO: dynamic url based on environment
      //redirectSignOut: "http://localhost:5173",
      redirectSignIn: "https://d3gb42ukfowr07.cloudfront.net", 
      redirectSignOut: "https://d3gb42ukfowr07.cloudfront.net",
      responseType: "code",
    },
  },
  API: {
    endpoints: [
      {
        name: "api",
        endpoint: 'https://wc9gntnz8j.execute-api.eu-central-1.amazonaws.com/v1',
        region: 'eu-central-1',
      },
    ],
  },
});

const app = createApp(App);

app.use(createPinia());

app.mount("#app");
