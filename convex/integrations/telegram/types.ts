export type TelegramUser = {
  id: number;
  is_bot: boolean;
};

export type TelegramChat = {
  id: number;
  type: 'private' | 'group' | 'supergroup' | 'channel';
};

export type TelegramPhoto = {
  file_id: string;
  width: number;
  height: number;
  file_size?: number;
};

export type TelegramDocument = {
  file_id: string;
  mime_type?: string;
  file_size?: number;
};

export type TelegramUnsupportedAttachment =
  | 'voice'
  | 'audio'
  | 'video'
  | 'video_note'
  | 'sticker'
  | 'animation'
  | 'contact'
  | 'location'
  | 'venue'
  | 'poll'
  | 'dice'
  | 'paid_media';

export type TelegramMessage = {
  message_id: number;
  chat: TelegramChat;
  from?: TelegramUser;
  text?: string;
  caption?: string;
  photo?: TelegramPhoto[];
  document?: TelegramDocument;
  media_group_id?: string;
  new_chat_members?: TelegramUser[];
} & Partial<Record<TelegramUnsupportedAttachment, object>>;

export type TelegramUpdate = {
  update_id: number;
  message?: TelegramMessage;
  edited_message?: TelegramMessage;
};

export type TelegramFile = {
  file_path?: string;
  file_size?: number;
};

export type TelegramResponse<T> =
  | { ok: true; result: T }
  | {
      ok: false;
      error_code: number;
      description: string;
      parameters?: { retry_after?: number };
    };

export type TelegramRichMessage = { markdown: string };

export type TelegramMethods = {
  getFile: {
    params: { file_id: string };
    result: TelegramFile;
  };
  sendChatAction: {
    params: { chat_id: number; action: 'typing' };
    result: true;
  };
  sendRichMessageDraft: {
    params: { chat_id: number; draft_id: number; rich_message: TelegramRichMessage };
    result: true;
  };
  sendRichMessage: {
    params: { chat_id: number; rich_message: TelegramRichMessage };
    result: TelegramMessage;
  };
};

export type TelegramMethod = keyof TelegramMethods;

export type TelegramClient = {
  call: <M extends TelegramMethod>(
    method: M,
    body: TelegramMethods[M]['params'],
    signal: AbortSignal,
  ) => Promise<TelegramMethods[M]['result']>;
  downloadFile: (path: string, signal: AbortSignal) => Promise<Response>;
};
