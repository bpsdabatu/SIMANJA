/** Status formulir untuk Server Action (dipakai bersama useActionState). */
export interface CaptchaChallenge {
  token: string;
  image: string; // data URI SVG
}

export interface FormState {
  error?: string;
  ok?: string;
  captcha?: CaptchaChallenge;
}
