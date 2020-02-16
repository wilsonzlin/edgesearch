import React from 'react';
import styles from './BasicArticle.module.css';
import {ExternalLink} from '../ExternalLink/ExternalLink';

export type IBasicArticle = {
  id: number,
  title: string,
  url: string,
}

export const BasicArticle = ({
  title,
  url,
}: IBasicArticle) => (
  <ExternalLink className={styles.article} href={url}>{title}</ExternalLink>
);
