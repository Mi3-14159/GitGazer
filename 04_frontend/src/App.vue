<script setup lang="ts">
import { Auth, API } from "aws-amplify";
import { ref } from "vue";

interface User {
  attributes: {
    name: string;
    email: string;
    picture: string;
    nickname: string;
  };
}

const user = ref<User>({ attributes: { name: "", email: "", picture: "", nickname: "" } });
const loading = ref(true);

const getUser = async () => {
  const u = await Auth.currentUserInfo();
  console.log(u);
  if (u) {
    user.value = u;
  }
  loading.value = false;
};

const handleSignOut = async () => await Auth.signOut();

const handleSignIn = async () =>
  await Auth.federatedSignIn({
    customProvider: "Github",
  });

const handlePublicRequest = async () => {
    const response = await API.get("api", "/public", {});
    alert(JSON.stringify(response));
};

const handlePrivateRequest = async () => {
    try {
      const response = await API.get("api", "/private", {
        headers: {
          Authorization: `Bearer ${(await Auth.currentSession())
            .getAccessToken()
            .getJwtToken()}`,
        },
      });
      alert(JSON.stringify(response));
    } catch (error) {
      alert(error);
    }
};

getUser();

</script>

<template>
  <div v-if="loading">Loading...</div>
  <div v-else className="container">
    <h2>SST + Cognito + GitHub OAuth + React</h2>
      <div v-if="user.attributes.name" className="profile">
        <p>Welcome {{user.attributes.name}} aka {{ user.attributes.nickname }} !</p>
        <p>{{user.attributes.email}}</p>
        <button :onClick="handleSignOut">logout</button>
      </div>
      <div v-else>
        <p>Not signed in</p>
        <button :onClick="handleSignIn">login</button>
      </div>
    <div className="api-section">
      <button :onClick="handlePublicRequest">call /public</button>
      <button :onClick="handlePrivateRequest">call /private</button>
    </div>
  </div>
</template>

<style scoped>
body {
  margin: 0;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto",
    "Oxygen", "Ubuntu", "Cantarell", "Fira Sans", "Droid Sans",
    "Helvetica Neue", sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

code {
  font-family: source-code-pro, Menlo, Monaco, Consolas, "Courier New",
    monospace;
}

.container {
  width: 100%;
  height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
}

button {
  width: 120px;
  padding: 10px;
  border: none;
  border-radius: 4px;
  background-color: #000;
  color: #fff;
  font-size: 16px;
  cursor: pointer;
}

.profile {
  border: 1px solid #ccc;
  padding: 20px;
  border-radius: 4px;
}
.api-section {
  width: 100%;
  margin-top: 20px;
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 10px;
}

.api-section > button {
  background-color: darkorange;
}
</style>
