import axios from "axios";

export const http = axios.create({
	baseURL: import.meta.env.VITE_BACKEND_URL + "/api",
});

http.interceptors.response.use(
	(res) => res.data,
	(err) => {
		const msg =
			err.response?.data?.error || err.message || "Request failed";
		return Promise.reject(new Error(msg));
	}
);
